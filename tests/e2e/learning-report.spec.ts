import { expect, test, type Page } from "@playwright/test";
import { installTauriMock } from "./helpers/tauri-mock";

const nav = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).click();
async function start(page: Page, course = "cafe-order") {
  await nav(page, "Training");
  const fresh = page.getByRole("button", { name: "New lesson", exact: true });
  if (await fresh.isVisible()) await fresh.click();
  await page.getByRole("combobox", { name: "Course", exact: true }).selectOption(course);
  await nav(page, "Start lesson");
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toBeVisible();
}
async function practice(page: Page, count = 3) {
  for (let i = 0; i < count; i++) {
    await nav(page, "Use suggested reply");
    await nav(page, "Send reply");
    if (i < count - 1)
      await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue("");
  }
  await expect(page.getByRole("button", { name: "Finish and review", exact: true })).toBeVisible();
}
const rows = (page: Page) =>
  page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem("language-lab-e2e-state")!).trainingCheckpoints as {
        type: string;
        payload: string;
      }[],
  );

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
});

test("shows an empty report view until a lesson is finished, retries a failed final save, and restores evidence", async ({
  page,
}) => {
  await nav(page, "Reports");
  await expect(page.getByText(/No completed reports in this view/)).toBeVisible();
  await start(page);
  await practice(page);
  const before = await rows(page);
  await page.evaluate(() => window.__llInvoke("test_fail_next_memory"));
  await nav(page, "Finish and review");
  await expect(page.getByRole("alert")).toContainText("Injected memory write failure");
  expect(await rows(page)).toEqual(before);
  await expect(page.getByLabel("Lesson review", { exact: true })).toHaveCount(0);
  await nav(page, "Finish and review");
  await expect(page.getByLabel("Practice summary", { exact: true })).toContainText(
    "Practice replies: 3",
  );
  await nav(page, "Reports");
  const report = page.getByLabel("Lesson review", { exact: true });
  await expect(report).toContainText("not an independent language assessment");
  await expect(report.getByLabel("Model commentary", { exact: true })).toHaveCount(0);
  await expect(report.getByLabel("Report language issues", { exact: true })).toContainText(
    "Diagnosis recorded for 3/3",
  );
  const goals = report.getByLabel("Goal evidence", { exact: true });
  await goals.locator("summary").first().click();
  await expect(goals.locator("blockquote").first()).toBeVisible();
  await expect(report.getByLabel("Next practice", { exact: true })).toContainText(
    "Repeat this scenario with different details",
  );
  await page.reload();
  await nav(page, "Reports");
  await expect(report).toBeVisible();
  expect((await rows(page)).filter((r) => r.type === "learning_memory_contribution")).toHaveLength(
    1,
  );
});

test("saves reflection atomically, preserves self-check answers and leaves active practice untouched", async ({
  page,
}) => {
  await start(page, "hotel-checkin");
  await practice(page, 5);
  await nav(page, "Finish and review");
  await page
    .getByRole("textbox", { name: "Review answer 1", exact: true })
    .fill("My check-in answer");
  await nav(page, "Save review answers");
  await expect(page.getByLabel("Independent review practice").getByRole("status")).toContainText(
    "saved on this device",
  );
  await start(page);
  await page
    .getByRole("textbox", { name: "Your reply", exact: true })
    .fill("Still working on my order.");
  await nav(page, "Send reply");
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue("");
  await nav(page, "Reports");
  const note = page.getByRole("textbox", { name: "What felt easy or difficult?", exact: true });
  await expect(note).toBeVisible();
  const before = await rows(page);
  await note.fill("I needed help asking about the deposit.");
  await page
    .getByRole("textbox", { name: "My next practice commitment", exact: true })
    .fill("Ask about a deposit without a hint.");
  await page.evaluate(() => window.__llInvoke("test_fail_next_memory"));
  await nav(page, "Save reflection");
  await expect(page.getByRole("alert")).toContainText("Injected memory write failure");
  expect(await rows(page)).toEqual(before);
  await expect(note).toHaveValue("I needed help asking about the deposit.");
  await nav(page, "Save reflection");
  await expect(page.getByLabel("Lesson reflection").getByRole("status")).toContainText(
    "Reflection saved on this device",
  );
  const after = await rows(page);
  const previous = before
    .filter((r) => r.type === "training_checkpoint")
    .map((r) => JSON.parse(r.payload))
    .find((s) => s.state.phase === "done");
  const saved = after
    .filter((r) => r.type === "training_checkpoint")
    .map((r) => JSON.parse(r.payload))
    .find((s) => s.state.phase === "done");
  expect(saved.learningReport).toEqual(previous.learningReport);
  expect(saved.reviewAnswers).toEqual(previous.reviewAnswers);
  expect(saved.learningMemory.knowledge).toEqual(previous.learningMemory.knowledge);
  expect(after.filter((r) => r.type === "learning_memory_contribution")).toHaveLength(2);
  await nav(page, "Training");
  await expect(page.getByLabel("Conversation", { exact: true })).toContainText(
    "Still working on my order.",
  );
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toBeVisible();
  await page.reload();
  await nav(page, "Reports");
  await expect(note).toHaveValue("I needed help asking about the deposit.");
  await nav(page, "Open source lesson");
  await expect(page.getByRole("textbox", { name: "Review answer 1", exact: true })).toHaveValue(
    "My check-in answer",
  );
});

test("opens legacy reports beyond the latest 50 resume checkpoints without silently rewriting them", async ({
  page,
}) => {
  await start(page);
  await practice(page);
  await nav(page, "Finish and review");
  await expect(page.getByLabel("Lesson review", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const key = "language-lab-e2e-state";
    const state = JSON.parse(sessionStorage.getItem(key)!);
    const original = state.trainingCheckpoints.find(
      (r: { type: string }) => r.type === "training_checkpoint",
    );
    state.trainingCheckpoints = Array.from({ length: 55 }, (_, i) => {
      const source = JSON.parse(original.payload);
      source.id = `legacy-report-${String(i).padStart(3, "0")}`;
      source.state.lessonId = source.id;
      source.state.updatedAt -= i * 1000;
      delete source.learningMemory;
      delete source.learningReport;
      delete source.reviewPlan;
      return {
        ...original,
        id: `training-${source.id}`,
        payload: JSON.stringify(source),
        updated_at: source.state.updatedAt,
      };
    });
    sessionStorage.setItem(key, JSON.stringify(state));
  });
  const before = await rows(page);
  await page.reload();
  await nav(page, "Reports");
  await expect(page.getByLabel("Report history").getByRole("button")).toHaveCount(20);
  await expect(page.getByRole("button", { name: "Refresh reports", exact: true })).toBeEnabled();
  await nav(page, "Show more reports");
  await nav(page, "Show more reports");
  await expect(page.getByLabel("Report history").getByRole("button")).toHaveCount(55);
  await page.getByLabel("Report history").getByRole("button").last().click();
  await expect(page.getByLabel("Lesson review", { exact: true })).toContainText(
    "Reconstructed from a legacy checkpoint",
  );
  await expect(page.getByLabel("Practice summary", { exact: true })).toContainText(
    "Practice replies: 3",
  );
  expect(await rows(page)).toEqual(before);
  await nav(page, "Practise this course again");
  await expect(page.getByRole("button", { name: "Start lesson", exact: true })).toBeVisible();
});

test("recovers report loading after a read failure and filters guided reports from AI conversations", async ({
  page,
}) => {
  await start(page);
  await practice(page);
  await nav(page, "Finish and review");
  await expect(page.getByLabel("Lesson review", { exact: true })).toBeVisible();
  await nav(page, "Reports");
  await expect(page.getByLabel("Lesson reflection", { exact: true })).toBeVisible();
  await page.evaluate(() => window.__llInvoke("test_fail_next_memory_read"));
  await nav(page, "Refresh reports");
  await expect(page.getByRole("alert")).toContainText("Injected memory read failure");
  await nav(page, "Retry report load");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("Lesson review", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Report mode", exact: true }).selectOption("ai");
  await expect(page.getByText(/No completed reports in this view/)).toBeVisible();
  await expect(page.getByLabel("Lesson review", { exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Report mode", exact: true }).selectOption("demo");
  await expect(page.getByLabel("Lesson review", { exact: true })).toBeVisible();
});
