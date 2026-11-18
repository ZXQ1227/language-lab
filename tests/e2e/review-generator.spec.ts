import { openWorkspacePage } from "./helpers/navigation";
import { expect, test, type Page } from "@playwright/test";
import { installTauriMock } from "./helpers/tauri-mock";

const nav = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).click();
const rows = (page: Page) =>
  page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem("language-lab-e2e-state")!).trainingCheckpoints as {
        type: string;
        payload: string;
      }[],
  );
const checkpoints = async (page: Page) =>
  (await rows(page))
    .filter((r) => r.type === "training_checkpoint")
    .map((r) => JSON.parse(r.payload));
async function start(page: Page, course = "hotel-checkin") {
  await openWorkspacePage(page, "Training");
  const fresh = page.getByRole("button", { name: "New lesson", exact: true });
  if (await fresh.isVisible()) await fresh.click();
  await page.getByRole("combobox", { name: "Course", exact: true }).selectOption(course);
  await nav(page, "Start lesson");
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toBeVisible();
}
async function send(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Your reply", exact: true }).fill(text);
  await nav(page, "Send reply");
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue("");
}
async function practice(page: Page, count = 5) {
  for (let i = 0; i < count; i++) {
    await nav(page, "Use suggested reply");
    await nav(page, "Send reply");
    if (i < count - 1)
      await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue("");
  }
  await expect(page.getByRole("button", { name: "Finish and review", exact: true })).toBeVisible();
}
async function finish(page: Page) {
  await nav(page, "Finish and review");
  await expect(page.getByLabel("Lesson review", { exact: true })).toBeVisible();
}
async function open(page: Page) {
  await nav(page, "Open targeted review");
  await expect(page.getByLabel("Targeted review practice", { exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
});

test("finishes atomically, recalls a source correction, records supported practice and restores it", async ({
  page,
}) => {
  await start(page);
  await send(page, "I go yesterday. I have a reservation.");
  await practice(page);
  const before = await rows(page);
  await page.evaluate(() => window.__llInvoke("test_fail_next_review"));
  await nav(page, "Finish and review");
  await expect(page.getByRole("alert")).toContainText("Injected review write failure");
  expect(await rows(page)).toEqual(before);
  await finish(page);
  const source = (await checkpoints(page))[0]!;
  expect((await rows(page)).filter((r) => r.type === "targeted_review_plan")).toHaveLength(1);
  await open(page);
  const practiceView = page.getByLabel("Targeted review practice", { exact: true });
  await expect(practiceView.locator("mark")).toHaveText("I go");
  await expect(practiceView).toContainText("Limited demo check");
  await expect(page.getByRole("button", { name: "Mark practised", exact: true })).toBeDisabled();
  await page.getByRole("textbox", { name: "Your review answer", exact: true }).fill("I go");
  await nav(page, "Check my answer");
  await expect(practiceView.getByRole("status")).toContainText("differs from the reference");
  await nav(page, "Reveal example");
  await expect(page.getByLabel("Review example", { exact: true })).toContainText("I went");
  await page.getByRole("textbox", { name: "Your review answer", exact: true }).fill("I went");
  await nav(page, "Check my answer");
  await expect(practiceView.getByRole("status")).toContainText("not a grammar assessment");
  await nav(page, "Mark practised");
  await expect(page.getByLabel("Review attempt history", { exact: true })).toContainText(
    "Example revealed",
  );
  const saved = (await checkpoints(page))[0]!;
  expect(saved.reviewPlan.progress[0]).toMatchObject({ status: "done", attemptCount: 1 });
  expect(saved.learningReport).toEqual(source.learningReport);
  expect(saved.learningMemory).toEqual(source.learningMemory);
  expect(saved.messages).toEqual(source.messages);
  await page.reload();
  await openWorkspacePage(page, "Review");
  await expect(page.getByLabel("Review queue summary", { exact: true })).toContainText(
    "Practised: 1",
  );
  await page.getByRole("combobox", { name: "Review status", exact: true }).selectOption("done");
  await expect(page.getByLabel("Review attempt history", { exact: true })).toContainText("I went");
  expect((await rows(page)).filter((r) => r.type === "targeted_review_plan")).toHaveLength(1);
});

test("retries failed attempt saves without losing the answer, reschedules once and preserves active training", async ({
  page,
}) => {
  await start(page);
  await send(page, "I go yesterday.");
  await practice(page);
  await finish(page);
  await start(page, "cafe-order");
  await send(page, "My order is still in progress.");
  await openWorkspacePage(page, "Review");
  const answer = page.getByRole("textbox", { name: "Your review answer", exact: true });
  await expect(answer).toBeVisible();
  await answer.fill("I went");
  await nav(page, "Check my answer");
  const before = await rows(page);
  await page.evaluate(() => window.__llInvoke("test_fail_next_review"));
  await nav(page, "Save and try tomorrow");
  await expect(page.getByRole("alert")).toContainText("Injected review write failure");
  expect(await rows(page)).toEqual(before);
  await expect(answer).toHaveValue("I went");
  await nav(page, "Save and try tomorrow");
  await expect(answer).toHaveValue("");
  const plan = (await checkpoints(page)).find((s) => s.state.phase === "done")!.reviewPlan;
  expect(plan.progress[0].attemptCount).toBe(1);
  expect(plan.progress[0].dueAt).toBe(plan.progress[0].attempts[0].at + 86_400_000);
  await openWorkspacePage(page, "Training");
  await expect(page.getByLabel("Conversation", { exact: true })).toContainText(
    "My order is still in progress.",
  );
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toBeVisible();
  await openWorkspacePage(page, "Review");
  await page
    .getByLabel("Review queue", { exact: true })
    .getByRole("button")
    .filter({ hasText: "Recall a correction" })
    .click();
  await expect(page.getByLabel("Review attempt history", { exact: true })).toContainText(
    "1 saved attempts",
  );
});

test("practises missed vocabulary with lexical feedback rather than a correctness grade", async ({
  page,
}) => {
  await start(page);
  await practice(page);
  await finish(page);
  const plan = (await checkpoints(page))[0]!.reviewPlan;
  const word = plan.tasks.find((t: { kind: string }) => t.kind === "vocabulary_drill")!;
  await open(page);
  await page
    .getByLabel("Review queue", { exact: true })
    .getByRole("button")
    .filter({ hasText: `Use a missed word · ${word.term}` })
    .click();
  const answer = page.getByRole("textbox", { name: "Your review answer", exact: true });
  await answer.fill("An unrelated reply.");
  await nav(page, "Check my answer");
  await expect(page.getByLabel("Targeted review practice").getByRole("status")).toContainText(
    "not found",
  );
  await answer.fill(`Could you explain ${word.term}, please?`);
  await nav(page, "Check my answer");
  await expect(page.getByLabel("Targeted review practice").getByRole("status")).toContainText(
    "not a correctness assessment",
  );
  await nav(page, "Mark practised");
  await expect(page.getByLabel("Review attempt history", { exact: true })).toContainText(
    "Target expression observed",
  );
});

test("generates a legacy plan explicitly and preserves answers when reopened", async ({ page }) => {
  await start(page, "cafe-order");
  await practice(page, 3);
  await finish(page);
  await page.evaluate(() => {
    const key = "language-lab-e2e-state";
    const state = JSON.parse(sessionStorage.getItem(key)!);
    state.trainingCheckpoints = state.trainingCheckpoints.filter(
      (row: { type: string }) => row.type !== "targeted_review_plan",
    );
    const row = state.trainingCheckpoints.find(
      (r: { type: string }) => r.type === "training_checkpoint",
    );
    const session = JSON.parse(row.payload);
    delete session.reviewPlan;
    row.payload = JSON.stringify(session);
    sessionStorage.setItem(key, JSON.stringify(state));
  });
  const before = await rows(page);
  await page.reload();
  await openWorkspacePage(page, "Reports");
  await expect(
    page.getByRole("button", { name: "Generate targeted review", exact: true }),
  ).toBeVisible();
  expect(await rows(page)).toEqual(before);
  await page.evaluate(() => window.__llInvoke("test_fail_next_review"));
  await nav(page, "Generate targeted review");
  await expect(page.getByRole("alert")).toContainText("Injected review write failure");
  expect(await rows(page)).toEqual(before);
  await nav(page, "Generate targeted review");
  const answer = page.getByRole("textbox", { name: "Your review answer", exact: true });
  await expect(answer).toBeVisible();
  await answer.fill("My practice answer.");
  await nav(page, "Check my answer");
  await nav(page, "Save and try tomorrow");
  await expect(answer).toHaveValue("");
  const saved = (await checkpoints(page))[0]!.reviewPlan;
  await nav(page, "Open lesson report");
  await nav(page, "Open targeted review");
  await expect(page.getByLabel("Review attempt history", { exact: true })).toContainText(
    "1 saved attempts",
  );
  expect((await checkpoints(page))[0]!.reviewPlan).toEqual(saved);
});

test("shows due and upcoming tasks using saved dates, and recovers queue read failure", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-17T02:00:00Z") });
  await openWorkspacePage(page, "Review");
  await expect(page.getByText(/No review tasks in this view/)).toBeVisible();
  await start(page, "cafe-order");
  await practice(page, 3);
  await finish(page);
  const plan = (await checkpoints(page))[0]!.reviewPlan;
  await page.evaluate(() => window.__llInvoke("test_fail_next_review_read"));
  await openWorkspacePage(page, "Review");
  await expect(page.getByRole("alert")).toContainText("Injected review read failure");
  await nav(page, "Retry review load");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("Review queue summary", { exact: true })).toContainText(
    "Due now: 0",
  );
  await page.getByRole("combobox", { name: "Review status", exact: true }).selectOption("due");
  await expect(page.getByLabel("Review queue", { exact: true }).getByRole("button")).toHaveCount(0);
  await page.clock.setSystemTime(new Date(plan.generatedAt + 2 * 86_400_000));
  await nav(page, "Refresh review queue");
  const due = plan.progress.filter(
    (p: { dueAt: number }) => p.dueAt <= plan.generatedAt + 2 * 86_400_000,
  );
  await expect(page.getByLabel("Review queue", { exact: true }).getByRole("button")).toHaveCount(
    due.length,
  );
  expect(due.length).toBeGreaterThan(0);
});
