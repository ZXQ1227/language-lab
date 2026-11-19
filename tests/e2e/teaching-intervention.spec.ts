import { openLibraryLesson, openWorkspacePage } from "./helpers/navigation";
import { expect, test, type Page } from "@playwright/test";
import { configureAiConnection, installTauriMock } from "./helpers/tauri-mock";

async function prepareHotel(page: Page) {
  await installTauriMock(page);
  await page.goto("/");
  await openWorkspacePage(page, "Scenarios");
  const card = await openLibraryLesson(page, "Hotel Check-in");
  await card.getByText("Configure course", { exact: true }).click();
  return card;
}
async function startDemo(page: Page, consecutive = false) {
  const card = await prepareHotel(page);
  if (consecutive) {
    await card.getByLabel("Practice turns between corrections").fill("0");
    await card.getByLabel("Practice turns before repeating a correction").fill("0");
  }
  await card.getByRole("button", { name: "Practise this course", exact: true }).click();
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
}
async function send(page: Page, text: string, saved = true) {
  const composer = page.getByRole("textbox", { name: "Your reply", exact: true });
  await composer.fill(text);
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  if (saved) await expect(composer).toHaveValue("");
}
const checkpoint = (page: Page) =>
  page.evaluate(() =>
    JSON.parse(
      JSON.parse(sessionStorage.getItem("language-lab-e2e-state")!).trainingCheckpoints[0].payload,
    ),
  );

test("keeps recasts brief, persists timing across help and restart, and avoids repeated reminders", async ({
  page,
}) => {
  await startDemo(page);
  await send(page, "I go yesterday.");
  const feedback = page.getByLabel("Language feedback", { exact: true });
  await expect(page.getByLabel("Conversation", { exact: true })).toContainText(
    "You can say: “I went”.",
  );
  await expect(
    feedback.getByText("Past time expressions require the past tense.", { exact: true }),
  ).not.toBeVisible();
  await feedback.getByText("Why this wording?", { exact: true }).click();
  await expect(
    feedback.getByText("Past time expressions require the past tense.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Repeat last reply", exact: true }).click();
  await expect.poll(async () => (await checkpoint(page)).state.turnCount).toBe(2);
  await page.reload();
  await openWorkspacePage(page, "Training");
  await send(page, "I am agree.");
  await expect(
    feedback.getByText(
      "Let's keep the conversation moving. Corrections are spaced between practice turns.",
      { exact: true },
    ),
  ).toBeVisible();
  await send(page, "I go yesterday.");
  await expect(
    feedback.getByText(
      "You have seen this correction recently. Keep practising before another reminder.",
      { exact: true },
    ),
  ).toBeVisible();
  await send(page, "I am agree.");
  await expect(feedback.getByText("Grammar · Form", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Conversation", { exact: true })).toContainText(
    "You can say: “I agree”.",
  );
  const saved = await checkpoint(page);
  expect(saved.state.correctionsGiven).toBe(2);
  expect(saved.state.hintsGiven).toBe(0);
  expect(saved.state.interventionState.practiceTurns).toBe(4);
  expect(
    saved.state.interventionState.corrections.map(
      (item: { practiceTurn: number }) => item.practiceTurn,
    ),
  ).toEqual([1, 4]);
});

test("uses explicitly configured correction intervals in the lesson snapshot", async ({ page }) => {
  await startDemo(page, true);
  await send(page, "I go yesterday.");
  await send(page, "I go yesterday.");
  const saved = await checkpoint(page);
  expect(saved.state.courseTemplate.teachingPolicy.correctionCooldownTurns).toBe(0);
  expect(saved.state.courseTemplate.teachingPolicy.repeatCorrectionCooldownTurns).toBe(0);
  expect(saved.state.correctionsGiven).toBe(2);
  expect(saved.state.interventionState.corrections).toHaveLength(2);
});

test("a failed checkpoint consumes neither a correction nor a spacing turn", async ({ page }) => {
  await startDemo(page);
  await page.evaluate(() => window.__llInvoke("test_fail_next_checkpoint"));
  await send(page, "I go yesterday.", false);
  await expect(page.getByRole("alert")).toContainText("Injected checkpoint write failure");
  expect((await checkpoint(page)).state.correctionsGiven).toBe(0);
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue(
    "I go yesterday.",
  );
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue("");
  const saved = await checkpoint(page);
  expect(saved.state.correctionsGiven).toBe(1);
  expect(saved.state.interventionState.practiceTurns).toBe(1);
  expect(saved.state.interventionState.corrections).toHaveLength(1);
  await send(page, "I am agree.");
  await expect(
    page.getByText(
      "Let's keep the conversation moving. Corrections are spaced between practice turns.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("requires an actual recast from connected AI and bounds delivery repair before saving", async ({
  page,
}) => {
  const card = await prepareHotel(page);
  await card.getByRole("button", { name: "Practise this course", exact: true }).click();
  let strategy = "missing";
  let replies = 0;
  let repaired = false;
  await page.route("http://localhost:11434/v1/chat/completions", async (route) => {
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST",
      "access-control-allow-headers": "authorization,content-type",
    };
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const body = route.request().postDataJSON();
    const system = body.messages[0].content as string;
    let output;
    if (system.includes("diagnosing a student utterance"))
      output = {
        intent: "check in",
        errors: [
          {
            category: "tense",
            original: "I go",
            corrected: "I went",
            explanation: "Use past tense with yesterday.",
            severity: "form",
            confidence: "high",
          },
        ],
      };
    else if (system.startsWith("Assess only")) {
      const input = JSON.parse(body.messages[1].content);
      output = {
        stageId: input.stage.id,
        criteria: input.stage.successCriteria.map((_: string, criterionIndex: number) => ({
          criterionIndex,
          met: false,
          evidence: [],
        })),
        feedback: "Please provide your booking name.",
      };
    } else {
      replies++;
      if (strategy === "missing" || !repaired) {
        repaired = strategy !== "missing";
        output = { reply: "What name is your booking under?", tone: "neutral" };
      } else
        output = {
          reply: "You can say I went. Yes, breakfast is included. What name is your booking under?",
          tone: "encouraging",
        };
    }
    await route.fulfill({
      status: 200,
      headers,
      contentType: "application/json",
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }),
    });
  });
  await configureAiConnection(page, { model: "test-intervention" });
  await page.getByLabel("Practice mode").selectOption("ai");
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
  const original = await checkpoint(page);
  await send(page, "I go yesterday. Is breakfast included?", false);
  await expect(page.getByRole("alert")).toContainText(
    "could not deliver the approved brief correction",
  );
  expect(replies).toBe(2);
  expect(await checkpoint(page)).toEqual(original);
  strategy = "repair";
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByLabel("Conversation", { exact: true })).toContainText(
    "You can say I went. Yes, breakfast is included.",
  );
  expect(replies).toBe(4);
  const saved = await checkpoint(page);
  expect(saved.state.correctionsGiven).toBe(1);
  expect(saved.state.interventionState.corrections).toHaveLength(1);
  expect(saved.diagnoses).toHaveLength(1);
});
