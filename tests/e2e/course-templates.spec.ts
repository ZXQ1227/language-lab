import { openCourseTopic, openWorkspacePage } from "./helpers/navigation";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import cafeOrder from "../../content/scenarios/cafe-order.json";
import { installTauriMock } from "./helpers/tauri-mock";

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
  await openWorkspacePage(page, "Scenarios");
});

test("previews authored steps and validates configuration before export", async ({ page }) => {
  const topic = await openCourseTopic(page, "Dining & shopping");
  const cafe = topic
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Ordering at a cafe", exact: true }) });
  await cafe.getByText("Configure course", { exact: true }).click();
  await expect(cafe.getByLabel("Lesson preview")).toContainText("Success criteria");
  await expect(cafe.getByLabel("Lesson preview")).toContainText("Order politely");
  await cafe.getByLabel("Practice level").selectOption("B1");
  await expect(cafe.getByRole("heading", { name: /Lesson preview/ })).toContainText("B1");
  await cafe.getByLabel("Maximum hints").fill("-1");
  await expect(cafe.getByRole("alert")).toContainText("between 0 and 20");
  await expect(cafe.getByRole("button", { name: "Export course JSON" })).toBeDisabled();
  await cafe.getByLabel("Maximum hints").fill("0");
  await cafe.getByLabel("Practice turns between corrections").fill("2");
  await cafe.getByLabel("Practice turns before repeating a correction").fill("6");
  await expect(cafe.getByRole("alert")).toHaveCount(0);
  await expect(cafe.getByRole("button", { name: "Export course JSON" })).toBeEnabled();
});

test("exports configured content and reimports it without changing shipped templates or user data", async ({
  page,
}) => {
  const topic = await openCourseTopic(page, "Dining & shopping");
  const cafe = topic
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Ordering at a cafe", exact: true }) });
  await cafe.getByText("Configure course", { exact: true }).click();
  const databaseBefore = await page.evaluate(() =>
    sessionStorage.getItem("language-lab-e2e-state"),
  );
  await cafe.getByLabel("Practice level").selectOption("B2");
  await cafe.getByLabel("Correction style").selectOption("off");
  await cafe.getByLabel("Maximum hints").fill("0");
  const downloadEvent = page.waitForEvent("download");
  await cafe.getByLabel("Practice turns between corrections").fill("2");
  await cafe.getByLabel("Practice turns before repeating a correction").fill("6");
  await cafe.getByRole("button", { name: "Export course JSON" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("cafe-order-course.json");
  const exported = await readFile((await download.path())!);
  const template = JSON.parse(exported.toString());
  expect(template.difficulty).toBe("B2");
  expect(template.courseTemplate.teachingPolicy).toMatchObject({
    correctionMode: "off",
    maxHints: 0,
    correctionCooldownTurns: 2,
    repeatCorrectionCooldownTurns: 6,
  });
  expect(template.courseTemplate.stages).toEqual(cafeOrder.courseTemplate.stages);
  await topic.getByRole("button", { name: "Close", exact: true }).click();
  const difficulty = page.getByRole("combobox", { name: "Difficulty", exact: true });
  await difficulty.selectOption("beginner");
  await page
    .getByLabel("Import course template")
    .setInputFiles({ name: "my-course.json", mimeType: "application/json", buffer: exported });
  const imported = page.getByRole("region", { name: "Imported templates" });
  await expect(imported.getByText("Configure course", { exact: true })).toHaveCount(0);
  await imported.getByRole("button", { name: "Show imports at all levels" }).click();
  await expect(difficulty).toHaveValue("all");
  await imported.getByText("Configure course", { exact: true }).click();
  await expect(imported.getByLabel("Practice level")).toHaveValue("B2");
  await expect(imported.getByLabel("Maximum hints")).toHaveValue("0");
  await expect(imported.getByLabel("Correction style")).toHaveValue("off");
  await expect(imported.getByLabel("Practice turns between corrections")).toHaveValue("2");
  await expect(imported.getByLabel("Practice turns before repeating a correction")).toHaveValue(
    "6",
  );
  await imported.getByLabel("Practice level").selectOption("A1");
  // Reimporting the same source resets unsaved edits to the file's configuration.
  await page.getByLabel("Import course template").setInputFiles({
    name: "my-course.json",
    mimeType: "application/json",
    buffer: exported,
  });
  await imported.getByText("Configure course", { exact: true }).click();
  await expect(imported.getByLabel("Practice level")).toHaveValue("B2");
  expect(await page.evaluate(() => sessionStorage.getItem("language-lab-e2e-state"))).toBe(
    databaseBefore,
  );
  await imported.getByRole("button", { name: "Remove imported template" }).click();
  await expect(imported).toHaveCount(0);
});

test("rejects corrupt JSON and broken objective references without adding templates", async ({
  page,
}) => {
  const input = page.getByLabel("Import course template");
  await input.setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{broken"),
  });
  await expect(page.getByRole("alert")).toContainText("Could not import template");
  const raw = structuredClone(cafeOrder);
  raw.courseTemplate.stages[0]!.objectiveIds = ["obj-99"];
  await input.setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(raw)),
  });
  await expect(page.getByRole("alert")).toContainText("Unknown objective: obj-99");
  await expect(page.getByRole("region", { name: "Imported templates" })).toHaveCount(0);
  // A subsequent valid import clears the error, even with the same filename.
  await input.setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(cafeOrder)),
  });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Imported templates" })).toBeVisible();
});
