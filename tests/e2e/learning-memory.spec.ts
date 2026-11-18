import { openWorkspacePage } from "./helpers/navigation";
import { expect, test, type Page } from "@playwright/test";
import { installTauriMock } from "./helpers/tauri-mock";

async function memory(page: Page) {
  await openWorkspacePage(page, "Learning memory");
  await expect(page.getByRole("heading", { name: "Profile memory", exact: true })).toBeVisible();
}
async function start(page: Page, course = "hotel-checkin") {
  await openWorkspacePage(page, "Training");
  const fresh = page.getByRole("button", { name: "New lesson", exact: true });
  if (await fresh.isVisible()) await fresh.click();
  await page.getByRole("combobox", { name: "Course", exact: true }).selectOption(course);
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toBeVisible();
}
async function send(page: Page, text: string, success = true) {
  await page.getByRole("textbox", { name: "Your reply", exact: true }).fill(text);
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  if (success)
    await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue("");
}
const rows = (page: Page) =>
  page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem("language-lab-e2e-state")!).trainingCheckpoints as {
        type: string;
        payload: string;
      }[],
  );
const reservation = (page: Page) =>
  page
    .getByLabel("Knowledge memory", { exact: true })
    .getByRole("listitem")
    .filter({ hasText: /^reservation ·/ });

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
});

test("saves an explicit profile, preserves it on failure and restores it without automatic assessment", async ({
  page,
}) => {
  await memory(page);
  await page.getByRole("combobox", { name: "Your stated level", exact: true }).selectOption("B1");
  await page
    .getByRole("textbox", { name: "Learning goals · one per line", exact: true })
    .fill("Travel conversations");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByText(/Your stated profile is saved on this device/)).toBeVisible();
  await page.evaluate(() => window.__llInvoke("test_fail_next_profile"));
  await page.getByRole("combobox", { name: "Your stated level", exact: true }).selectOption("C1");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Injected profile write failure");
  await expect(page.getByText(/Unsaved profile changes/)).toBeVisible();
  await page.reload();
  await memory(page);
  await expect(page.getByRole("combobox", { name: "Your stated level", exact: true })).toHaveValue(
    "B1",
  );
  await expect(
    page.getByRole("textbox", { name: "Learning goals · one per line", exact: true }),
  ).toHaveValue("Travel conversations");
  await start(page);
  await send(page, "I go yesterday. I have a reservation.");
  await memory(page);
  await expect(page.getByRole("combobox", { name: "Your stated level", exact: true })).toHaveValue(
    "B1",
  );
});

test("keeps knowledge, error and episode observations across lessons and restart without double counting", async ({
  page,
}) => {
  await start(page);
  await send(page, "I go yesterday. I have a reservation.");
  await memory(page);
  await expect(reservation(page)).toContainText("Practice turns: 1");
  await expect(reservation(page)).toContainText("Guided: 1 · Free conversation: 0");
  await expect(page.getByLabel("Error memory", { exact: true })).toContainText("I go → I went");
  await expect(page.getByLabel("Error memory", { exact: true })).toContainText(
    "Model observations: 0 · Demo observations: 1",
  );
  await start(page);
  await send(page, "I have a reservation.");
  await memory(page);
  await expect(reservation(page)).toContainText("Practice turns: 2");
  await expect(
    page.getByRole("heading", { name: "Episodic memory · 2", exact: true }),
  ).toBeVisible();
  await page.reload();
  await memory(page);
  await expect(reservation(page)).toContainText("Practice turns: 2");
  await page.getByRole("button", { name: "Refresh memory", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refresh memory", exact: true })).toBeEnabled();
  await expect(reservation(page)).toContainText("Practice turns: 2");
  expect(
    (await rows(page)).filter((row) => row.type === "learning_memory_contribution"),
  ).toHaveLength(2);
});

test("records a completed guided episode once and opens its saved source lesson", async ({
  page,
}) => {
  await start(page, "cafe-order");
  for (let index = 0; index < 3; index++) {
    await page.getByRole("button", { name: "Use suggested reply", exact: true }).click();
    await page.getByRole("button", { name: "Send reply", exact: true }).click();
    await expect(
      page.getByText(
        index === 2
          ? "All lesson objectives demonstrated"
          : index === 0
            ? "Current step: Choose size and milk"
            : "Current step: Confirm the order",
        { exact: true },
      ),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Finish and review", exact: true }).click();
  await expect(page.getByLabel("Lesson review", { exact: true })).toBeVisible();
  await memory(page);
  const episodes = page.getByLabel("Episodic memory", { exact: true });
  await expect(episodes).toContainText("Ordering at a cafe · en · Completed");
  await expect(episodes).toContainText("guided examples, not independent assessment");
  await expect(page.getByText(/No profile saved yet/)).toBeVisible();
  await episodes.getByRole("button", { name: "Open source lesson", exact: true }).click();
  await expect(page.getByLabel("Lesson review", { exact: true })).toBeVisible();
});

test("rolls back lesson and memory together, retries once, and recovers a read failure", async ({
  page,
}) => {
  await start(page);
  const before = await rows(page);
  await page.evaluate(() => window.__llInvoke("test_fail_next_memory"));
  await send(page, "I go yesterday. I have a reservation.", false);
  await expect(page.getByRole("alert")).toContainText("Injected memory write failure");
  expect(await rows(page)).toEqual(before);
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue(
    "I go yesterday. I have a reservation.",
  );
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue("");
  await memory(page);
  await expect(reservation(page)).toContainText("Practice turns: 1");
  await page.evaluate(() => window.__llInvoke("test_fail_next_memory_read"));
  await page.getByRole("button", { name: "Refresh memory", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Injected memory read failure");
  await page.getByRole("button", { name: "Retry memory load", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refresh memory", exact: true })).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(reservation(page)).toContainText("Practice turns: 1");
});

test("reads legacy checkpoint memory without rewriting it and upgrades only on a successful practice save", async ({
  page,
}) => {
  await start(page);
  await send(page, "I have a reservation.");
  await page.evaluate(() => {
    const key = "language-lab-e2e-state";
    const state = JSON.parse(sessionStorage.getItem(key)!);
    state.trainingCheckpoints = state.trainingCheckpoints.filter(
      (row: { type: string }) => row.type === "training_checkpoint",
    );
    const session = JSON.parse(state.trainingCheckpoints[0].payload);
    delete session.learningMemory;
    state.trainingCheckpoints[0].payload = JSON.stringify(session);
    sessionStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await memory(page);
  await expect(reservation(page)).toContainText("Practice turns: 1");
  expect(await rows(page)).toHaveLength(1);
  await page
    .getByLabel("Episodic memory", { exact: true })
    .getByRole("button", { name: "Open source lesson", exact: true })
    .click();
  await send(page, "I have a reservation.");
  await memory(page);
  await expect(reservation(page)).toContainText("Practice turns: 2");
  expect(
    (await rows(page)).filter((row) => row.type === "learning_memory_contribution"),
  ).toHaveLength(1);
});
