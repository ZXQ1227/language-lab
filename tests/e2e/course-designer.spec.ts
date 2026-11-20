import { expect, test, type Page } from "@playwright/test";
import { interviewCourseDraft, practiceGoal } from "../fixtures/course-designer";
import { configureAiConnection, installTauriMock, type MockState } from "./helpers/tauri-mock";
import { openWorkspacePage } from "./helpers/navigation";

const endpoint = "http://localhost:11434/v1/chat/completions";
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const checkpoints = (page: Page) =>
  page.evaluate(() => {
    const state: MockState = JSON.parse(sessionStorage.getItem("language-lab-e2e-state")!);
    return (state.trainingCheckpoints ?? [])
      .filter((row) => row.type === "training_checkpoint")
      .map((row) => JSON.parse(row.payload));
  });

test("cold start keeps a guided course available without calling a model", async ({ page }) => {
  let requests = 0;
  await page.route(endpoint, (route) => {
    requests++;
    return route.abort();
  });
  await installTauriMock(page);
  await page.goto("/");
  await expect(button(page, "Free conversation")).toBeVisible();
  await expect(button(page, "Design a lesson with AI")).toHaveCount(0);
  await expect(button(page, "Generate lesson preview")).toHaveCount(0);
  await button(page, "Set up lesson").click();
  await expect(page.getByLabel("Practice mode")).toHaveValue("demo");
  await button(page, "Start lesson").click();
  await expect(page.getByRole("heading", { name: /^Checking in for a flight ·/ })).toBeVisible();
  expect(requests).toBe(0);
});

test("retries an invalid generation, previews without writing, and teaches the saved AI course", async ({
  page,
}) => {
  await installTauriMock(page);
  const generationRequests: unknown[] = [];
  await page.route(endpoint, async (route) => {
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
    let result: unknown;
    if (system.startsWith("Design one fictional")) {
      generationRequests.push(JSON.parse(messages[1].content));
      result = generationRequests.length === 1 ? { title: "Incomplete" } : interviewCourseDraft;
    } else if (system.startsWith("Assess only")) {
      const { stage, transcript } = JSON.parse(messages[1].content);
      const learner = transcript.at(-1);
      result = {
        stageId: stage.id,
        relevance: "in_scene",
        criteria: [
          {
            criterionIndex: 0,
            met: true,
            evidence: [{ messageSeq: learner.seq, quote: learner.content }],
          },
        ],
        feedback: "Goal demonstrated.",
      };
    } else if (system.includes("diagnosing a student utterance")) {
      result = { errors: [], fluency: "fluent", intent: "reschedule the interview" };
    } else if (system.includes("assessing a finished lesson")) {
      result = {
        score: 80,
        summary: "You made the request and confirmed a time.",
        strengths: [],
        improvements: [],
      };
    } else {
      result = {
        reply: system.includes("Wrap up warmly")
          ? "You're booked for Thursday at two. See you then!"
          : "Thursday at two is available. Does that suit you?",
        tone: "neutral",
      };
    }
    await route.fulfill({
      status: 200,
      headers,
      json: { choices: [{ message: { content: JSON.stringify(result) } }] },
    });
  });

  await page.goto("/");
  await configureAiConnection(page, { model: "test-course-designer" });
  await openWorkspacePage(page, "Scenarios");
  await button(page, "Design a lesson with AI").click();
  await expect(button(page, "Generate lesson preview")).toBeDisabled();
  expect(generationRequests).toHaveLength(0);

  const goal = page.getByRole("textbox", { name: "What would you like to practise?" });
  await goal.fill(practiceGoal);
  await button(page, "Generate lesson preview").click();
  await expect(page.getByRole("alert")).toContainText("Could not design a lesson");
  await expect(
    page
      .getByRole("region", { name: "Travel & stays" })
      .getByRole("button", { name: "Checking in for a flight" }),
  ).toBeVisible();
  await expect(goal).toHaveValue(practiceGoal);
  expect(await checkpoints(page)).toEqual([]);

  await button(page, "Generate lesson preview").click();
  await expect(
    page.getByRole("heading", { name: /^Reschedule a job interview · A2/ }),
  ).toBeVisible();
  await expect(page.getByText("Ask to reschedule the interview politely.")).toBeVisible();
  await expect(page.getByLabel("Practice mode")).toHaveValue("ai");
  expect(generationRequests).toEqual(
    Array(2).fill({
      goal: practiceGoal,
      targetLanguage: "en",
      level: "A2",
      estimatedMinutes: 10,
    }),
  );
  expect(await checkpoints(page)).toEqual([]);

  await button(page, "Start lesson").click();
  await expect(page.getByLabel("Conversation")).toContainText(interviewCourseDraft.openingLine);
  const [started] = await checkpoints(page);
  expect(started.scenario.id).toMatch(/^ai-/);
  expect(started.state.courseTemplate.stages).toHaveLength(2);
  await page.reload();
  await button(page, "Continue lesson").click();
  await expect(page.getByLabel("Conversation")).toContainText(interviewCourseDraft.openingLine);

  const reply = page.getByRole("textbox", { name: "Your reply", exact: true });
  await reply.fill("Could we reschedule my interview?");
  await button(page, "Send reply").click();
  await expect(page.getByLabel("Conversation")).toContainText("Thursday at two is available.");
  await expect(page.getByText("Current step: Confirm the appointment")).toBeVisible();
  await reply.fill("Thursday at two works. I'll see you then.");
  await button(page, "Send reply").click();
  await button(page, "Finish and review").click();
  await expect(page.getByLabel("Lesson review", { exact: true })).toBeVisible();
  const [finished] = await checkpoints(page);
  expect(finished.scenario).toEqual(started.scenario);
  expect(finished.state.phase).toBe("done");
  expect(finished.reviewPlan).toBeDefined();
  expect(generationRequests).toHaveLength(2);
});
