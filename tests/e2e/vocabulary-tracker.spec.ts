import { openWorkspacePage } from "./helpers/navigation";
import { expect, test, type Page } from "@playwright/test";
import { installTauriMock } from "./helpers/tauri-mock";

async function startHotel(page: Page) {
  await installTauriMock(page);
  await page.goto("/");
  await openWorkspacePage(page, "Training");
  await page.getByRole("combobox", { name: "Course", exact: true }).selectOption("hotel-checkin");
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
  await page.getByText("Vocabulary progress · 0/12 used", { exact: true }).click();
}
const checkpoint = (page: Page) =>
  page.evaluate(() =>
    JSON.parse(
      JSON.parse(sessionStorage.getItem("language-lab-e2e-state")!).trainingCheckpoints[0].payload,
    ),
  );

test("tracks authored forms with original evidence, separate turn counts and restart persistence", async ({
  page,
}) => {
  await startHotel(page);
  const panel = page.getByLabel("Vocabulary progress", { exact: true });
  await expect(panel.getByText("reservation · Not used yet", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Give me a hint", exact: true }).click();
  await expect(panel.getByText("reservation · Not used yet", { exact: true })).toBeVisible();
  const utterance = "I’d like two key cards. Key cards and a lift, please.";
  await page.getByRole("textbox", { name: "Your reply", exact: true }).fill(utterance);
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(
    panel.getByText("key card · Used in 1 practice turn · 2 matches", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText("elevator · Used in 1 practice turn · 1 match", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText("ID · Not used yet", { exact: true })).toBeVisible();
  await expect(panel.locator("mark").filter({ hasText: "Key cards" })).toBeVisible();
  await page.getByRole("button", { name: "Repeat last reply", exact: true }).click();
  const saved = await checkpoint(page);
  expect(saved.state.vocabularySeen).toEqual({ "key card": 1, elevator: 1 });
  expect(saved.vocabularyTrackingVersion).toBe(1);
  await page.reload();
  await openWorkspacePage(page, "Training");
  await page.getByText("Vocabulary progress · 2/12 used", { exact: true }).click();
  await expect(
    page.getByText("key card · Used in 1 practice turn · 2 matches", { exact: true }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Your reply", exact: true }).fill("My key card, please.");
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(
    page.getByText("key card · Used in 2 practice turns · 3 matches", { exact: true }),
  ).toBeVisible();
  expect((await checkpoint(page)).state.vocabularySeen["key card"]).toBe(2);
});

test("failed writes preserve vocabulary and retry records exactly one practice turn", async ({
  page,
}) => {
  await startHotel(page);
  await page.evaluate(() => window.__llInvoke("test_fail_next_checkpoint"));
  const utterance = "Is the deposit refundable? The deposit, please.";
  await page.getByRole("textbox", { name: "Your reply", exact: true }).fill(utterance);
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Injected checkpoint write failure");
  await expect(page.getByText("deposit · Not used yet", { exact: true })).toBeVisible();
  expect((await checkpoint(page)).state.vocabularySeen).toEqual({});
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue(
    utterance,
  );
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(
    page.getByText("deposit · Used in 1 practice turn · 2 matches", { exact: true }),
  ).toBeVisible();
  const saved = await checkpoint(page);
  expect(saved.state.vocabularySeen).toEqual({ deposit: 1, refundable: 1 });
  expect(saved.state.turnCount).toBe(1);
  expect(saved.messages).toHaveLength(3);
});
