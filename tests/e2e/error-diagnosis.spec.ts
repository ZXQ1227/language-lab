import { openLibraryLesson, openWorkspacePage } from "./helpers/navigation";
import { expect, test, type Page } from "@playwright/test";
import { configureAiConnection, installTauriMock } from "./helpers/tauri-mock";

const utterance = "I go yesterday and I have a reserve.";
function diagnose(text: string, confidence = "high") {
  const error = (
    category: string,
    original: string,
    corrected: string,
    explanation: string,
    severity = "form",
  ) => ({
    category,
    original,
    corrected,
    explanation,
    severity,
    confidence,
    start: text.indexOf(original),
    end: text.indexOf(original) + original.length,
  });
  return {
    intent: "check in",
    fluency: "halting",
    errors: text.includes("reserve")
      ? [
          error("tense", "I go", "I went", "Use past tense with yesterday."),
          error(
            "vocabulary",
            "reserve",
            "reservation",
            "A hotel booking is a reservation.",
            "meaning",
          ),
        ]
      : text.includes("I am agree")
        ? [error("grammar", "I am agree", "I agree", "Agree is a verb.")]
        : [],
  };
}

async function startHotel(
  page: Page,
  candidate: (text: string) => unknown = diagnose,
  mode = "gentle",
) {
  await installTauriMock(page);
  await page.goto("/");
  await openWorkspacePage(page, "Scenarios");
  const card = await openLibraryLesson(page, "Hotel Check-in");
  await card.getByText("Configure course", { exact: true }).click();
  await card.getByLabel("Correction style").selectOption(mode);
  await card.getByLabel("Maximum corrections").fill("1");
  await card.getByRole("button", { name: "Practise this course", exact: true }).click();
  let replies = 0;
  let diagnosisCalls = 0;
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
    if (system.includes("diagnosing a student utterance")) {
      diagnosisCalls++;
      output = candidate(body.messages.at(-1).content);
    } else if (system.startsWith("Assess only")) {
      const input = JSON.parse(body.messages[1].content);
      output = {
        stageId: input.stage.id,
        criteria: input.stage.successCriteria.map((_: string, criterionIndex: number) => ({
          criterionIndex,
          met: false,
          evidence: [],
        })),
        feedback: "Please provide your booking name and length of stay.",
      };
    } else {
      const responses = [
        "Thank you. What name is the booking under?",
        "How many nights are you staying?",
        "Could you confirm your booking name?",
      ];
      const approved = system.match(
        /Approved correction data: (.+?)\. Include the corrected wording/,
      );
      const correction = approved ? (JSON.parse(approved[1]!).corrected as string) : undefined;
      output = {
        reply: `${correction ? `You can say: “${correction}”. ` : ""}${responses[replies++ % responses.length]}`,
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
  await configureAiConnection(page, { model: "test-diagnosis" });
  await page.getByLabel("Practice mode").selectOption("ai");
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
  return { diagnosisCalls: () => diagnosisCalls };
}
async function send(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Your reply", exact: true }).fill(text);
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
}
const checkpoint = (page: Page) =>
  page.evaluate(() =>
    JSON.parse(
      JSON.parse(sessionStorage.getItem("language-lab-e2e-state")!).trainingCheckpoints[0].payload,
    ),
  );

test("prioritizes vocabulary meaning, highlights evidence and restores feedback after help and a corrected reply", async ({
  page,
}) => {
  const calls = await startHotel(page);
  await send(page, utterance);
  const feedback = page.getByLabel("Language feedback", { exact: true });
  const correction = feedback.getByLabel("Correction", { exact: true });
  await expect(correction).toHaveCSS("background-color", "rgb(252, 237, 239)");
  await expect(correction).toHaveCSS("color", "rgb(128, 59, 73)");
  await expect(feedback.getByText("Word choice · Affects meaning", { exact: true })).toBeVisible();
  await expect(feedback.locator("mark")).toHaveText("reserve");
  await feedback.getByText("Why this wording?", { exact: true }).click();
  await expect(
    feedback.getByText("A hotel booking is a reservation.", { exact: true }),
  ).toBeVisible();
  const saved = await checkpoint(page);
  expect(saved.diagnoses[0].diagnosis.errors).toHaveLength(2);
  expect(saved.diagnoses[0].correctionIndex).toBe(0);
  expect(saved.messages[1].content).toBe(utterance);
  expect(saved.state.vocabularySeen).toEqual({});
  await page.getByRole("button", { name: "Repeat last reply", exact: true }).click();
  await expect.poll(async () => (await checkpoint(page)).state.turnCount).toBe(2);
  await expect(feedback.locator("mark")).toHaveText("reserve");
  expect(calls.diagnosisCalls()).toBe(1);
  await page.reload();
  await openWorkspacePage(page, "Training");
  await expect(feedback.getByText("Word choice · Affects meaning", { exact: true })).toBeVisible();
  await send(page, "I have a reservation under Alex Chen for two nights.");
  await expect(
    feedback.getByText("No high-confidence correction was found in this reply.", { exact: true }),
  ).toBeVisible();
  await feedback.getByText("Earlier feedback · 1", { exact: true }).click();
  await expect(feedback.getByText("Word choice · Affects meaning", { exact: true })).toBeVisible();
  expect((await checkpoint(page)).state.correctionsGiven).toBe(1);
});

for (const mode of ["gentle", "off"])
  test(`respects ${mode} correction policy and never derives fluency hints from text errors`, async ({
    page,
  }) => {
    await startHotel(page, diagnose, mode);
    await send(page, utterance);
    const feedback = page.getByLabel("Language feedback", { exact: true });
    if (mode === "gentle")
      await expect(
        feedback.getByText("Word choice · Affects meaning", { exact: true }),
      ).toBeVisible();
    else
      await expect(
        feedback.getByText("Live corrections are turned off for this course.", { exact: true }),
      ).toBeVisible();
    await send(page, "I am agree.");
    await expect(
      feedback.getByRole("heading", { name: "Language feedback · reply 2", exact: true }),
    ).toBeVisible();
    await expect(
      feedback.getByText(
        mode === "gentle"
          ? "The live correction limit has been reached. Keep practising."
          : "Live corrections are turned off for this course.",
        { exact: true },
      ),
    ).toBeVisible();
    const saved = await checkpoint(page);
    expect(saved.diagnoses).toHaveLength(2);
    expect(saved.diagnoses[1].correctionIndex).toBeUndefined();
    expect(saved.state.correctionsGiven).toBe(mode === "gentle" ? 1 : 0);
    expect(saved.state.hintsGiven).toBe(0);
    expect(saved.diagnoses[1].diagnosis.fluency).toBe("not_assessed");
  });

test("invalid diagnosis and failed writes preserve the draft and retry without duplicate errors", async ({
  page,
}) => {
  let invalid = true;
  const calls = await startHotel(page, (text) =>
    invalid
      ? {
          intent: "check in",
          errors: [
            {
              category: "grammar",
              original: "invented text",
              corrected: "new text",
              explanation: "Unsupported citation.",
            },
          ],
        }
      : diagnose(text),
  );
  await send(page, utterance);
  await expect(page.getByRole("alert")).toContainText("diagnosis could not be validated");
  expect(calls.diagnosisCalls()).toBe(2);
  expect((await checkpoint(page)).diagnoses).toEqual([]);
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue(
    utterance,
  );
  invalid = false;
  await page.evaluate(() => window.__llInvoke("test_fail_next_checkpoint"));
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Injected checkpoint write failure");
  expect((await checkpoint(page)).diagnoses).toEqual([]);
  await expect(page.getByLabel("Language feedback", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByText("Word choice · Affects meaning", { exact: true })).toBeVisible();
  const saved = await checkpoint(page);
  expect(saved.diagnoses).toHaveLength(1);
  expect(saved.state.turnCount).toBe(1);
  expect(saved.state.correctionsGiven).toBe(1);
  expect(
    saved.events.filter((event: { type: string }) => event.type === "error_made"),
  ).toHaveLength(2);
});

test("withholds uncertain diagnoses instead of labelling them as errors", async ({ page }) => {
  await startHotel(page, (text) => diagnose(text, "medium"));
  await send(page, utterance);
  const feedback = page.getByLabel("Language feedback", { exact: true });
  await expect(
    feedback.getByText(
      "Some wording needs more context. Uncertain suggestions were not treated as errors.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(feedback.getByLabel("Correction", { exact: true })).toHaveCount(0);
  const saved = await checkpoint(page);
  expect(saved.diagnoses[0].diagnosis.withheldCount).toBe(2);
  expect(saved.diagnoses[0].diagnosis.errors).toEqual([]);
  expect(saved.state.correctionsGiven).toBe(0);
  expect(saved.state.hintsGiven).toBe(0);
});
