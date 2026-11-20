import { expect, test } from "@playwright/test";
import hotel from "../../content/scenarios/hotel-checkin.json";
import { openWorkspacePage } from "./helpers/navigation";
import { configureAiConnection, installTauriMock } from "./helpers/tauri-mock";

test("opens the next-day hotel variation, resumes it once, and records a verified next-day completion", async ({
  page,
}) => {
  await installTauriMock(page);
  const day = (date: number) => new Date(2026, 10, date, 13);
  await page.clock.setFixedTime(day(20));
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
    const { messages } = route.request().postDataJSON();
    const system: string = messages[0].content;
    let output: unknown;
    if (system.startsWith("Assess only")) {
      const { stage, transcript } = JSON.parse(messages[1].content);
      const learner = transcript.at(-1);
      output = {
        stageId: stage.id,
        relevance: "in_scene",
        criteria: stage.successCriteria.map((_: string, criterionIndex: number) => ({
          criterionIndex,
          met: true,
          evidence: [{ messageSeq: learner.seq, quote: learner.content }],
        })),
        feedback: "The staged evidence was recorded.",
      };
    } else if (system.includes("diagnosing a student utterance")) {
      output = { intent: "practise travel", errors: [] };
    } else if (system.includes("assessing a finished lesson")) {
      output = { score: 80, summary: "Practised hotel check-in.", strengths: [], improvements: [] };
    } else {
      output = {
        reply: `Thank you for confirming that. Check ${messages.length}.`,
        tone: "neutral",
      };
    }
    await route.fulfill({
      headers,
      json: { choices: [{ message: { content: JSON.stringify(output) } }] },
    });
  });

  const action = (name: string) => page.getByRole("button", { name, exact: true });
  const answer = async (text: string) => {
    const draft = page.getByRole("textbox", { name: "Your reply", exact: true });
    await draft.fill(text);
    await action("Send reply").click();
    await expect(page.getByRole("list", { name: "Conversation", exact: true })).toContainText(text);
  };
  const rows = () =>
    page.evaluate(() =>
      (JSON.parse(sessionStorage.getItem("language-lab-e2e-state")!).trainingCheckpoints ?? [])
        .filter((row: { type: string }) => row.type === "training_checkpoint")
        .map((row: { payload: string }) => JSON.parse(row.payload)),
    );
  await page.goto("/");
  await configureAiConnection(page, { model: "test-travel" });
  await page.getByRole("combobox", { name: "Course", exact: true }).selectOption("hotel-checkin");
  await page.getByRole("combobox", { name: "Practice mode", exact: true }).selectOption("ai");
  await action("Start lesson").click();
  const examples = hotel.courseTemplate.learningPack.guidedPractice.map(
    ({ suggestedReply }) => suggestedReply,
  );
  for (const text of examples) await answer(text);
  await action("Finish and review").click();
  await expect(page.getByLabel("Lesson review")).toBeVisible();
  const source = (await rows())[0];

  await openWorkspacePage(page, "Review");
  const travel = page.getByRole("region", { name: "Next-day travel practice", exact: true });
  await expect(action("Start a new hotel situation")).toBeDisabled();
  await page.clock.setFixedTime(day(21));
  await action("Refresh review queue").click();
  await action("Start a new hotel situation").click();
  await expect(page.getByText(/Reservation not found/i).first()).toBeVisible();
  const attempt = (await rows()).find((row: { travelTransfer?: unknown }) => row.travelTransfer);
  expect(attempt.travelTransfer).toEqual({ sourceLessonId: source.id });
  expect(attempt.scenario.courseTemplate.selectedVariationId).toBe("reservation-not-found");
  await openWorkspacePage(page, "Review");
  await action("Continue the new hotel situation").click();
  expect(
    (await rows()).filter((row: { travelTransfer?: unknown }) => row.travelTransfer),
  ).toHaveLength(1);
  for (const [index, text] of examples.entries()) {
    await answer(
      index === 0 ? "My confirmation number is HV-2048. Could you check again, please?" : text,
    );
  }
  await expect(page.getByText("All lesson objectives demonstrated", { exact: true })).toBeVisible();
  const completed = (await rows()).find((row: { id: string }) => row.id === attempt.id);
  expect(completed.travelTransfer.completedAt).toBe(day(21).getTime());

  await page.clock.setFixedTime(day(22));
  await openWorkspacePage(page, "Review");
  await expect(travel).toContainText("Next-day completion: 100% (1 of 1 expired practice windows)");
  await expect(action("Open completed travel practice")).toBeVisible();
});
