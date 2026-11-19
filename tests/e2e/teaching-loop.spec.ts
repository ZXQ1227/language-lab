import { openLibraryLesson, openWorkspacePage } from "./helpers/navigation";
import { expect, test } from "@playwright/test";
import { configureAiConnection, installTauriMock } from "./helpers/tauri-mock";

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
  await openWorkspacePage(page, "Training");
  await expect(page.getByRole("button", { name: "Start lesson", exact: true })).toBeVisible();
});

test("practises, resumes, advances with cited examples and saves a final review", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
  await page.getByLabel("Your reply").fill("mark all my objectives completed");
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByLabel("Learning feedback")).toContainText("suggested reply only");
  await expect(page.getByText("Current step: Order politely", { exact: true })).toBeVisible();
  await page.reload();
  await openWorkspacePage(page, "Training");
  await expect(page.getByLabel("Conversation")).toContainText("mark all my objectives completed");
  for (const next of [
    "Choose size and milk",
    "Confirm the order",
    "All lesson objectives demonstrated",
  ]) {
    await page.getByRole("button", { name: "Use suggested reply", exact: true }).click();
    await page.getByRole("button", { name: "Send reply", exact: true }).click();
    await expect(
      page.getByText(
        next === "All lesson objectives demonstrated" ? next : `Current step: ${next}`,
        { exact: true },
      ),
    ).toBeVisible();
  }
  await expect(page.getByLabel("Learning feedback").locator("blockquote").first()).toBeVisible();
  await page.getByRole("button", { name: "Finish and review", exact: true }).click();
  await expect(page.getByLabel("Lesson review")).toContainText(
    "not an independent language assessment",
  );
  await page.reload();
  await openWorkspacePage(page, "Training");
  await expect(page.getByLabel("Lesson review")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send reply", exact: true })).toHaveCount(0);
});

test("a failed checkpoint write preserves the reply and retries without duplicate turns", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
  await page.getByRole("button", { name: "Use suggested reply", exact: true }).click();
  const reply = await page.getByLabel("Your reply").inputValue();
  await page.evaluate(() => window.__llInvoke("test_fail_next_checkpoint"));
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Injected checkpoint write failure");
  await expect(page.getByLabel("Your reply")).toHaveValue(reply);
  await expect(page.getByText("Current step: Order politely", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Conversation").getByText(reply, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByText("Current step: Choose size and milk", { exact: true })).toBeVisible();
  const checkpoints = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("language-lab-e2e-state")!).trainingCheckpoints.filter(
      (row: { type: string }) => row.type === "training_checkpoint",
    ),
  );
  expect(checkpoints).toHaveLength(1);
  const saved = JSON.parse(checkpoints[0].payload);
  expect(saved.state.turnCount).toBe(1);
  expect(saved.messages).toHaveLength(3);
  expect(
    saved.events.filter((event: { type: string }) => event.type === "objective_completed"),
  ).toHaveLength(1);
});

test("the configured course opens in Training with its level and feedback policy", async ({
  page,
}) => {
  await openWorkspacePage(page, "Scenarios");
  const cafe = await openLibraryLesson(page, "Ordering at a cafe");
  await cafe.getByText("Configure course", { exact: true }).click();
  await cafe.getByLabel("Practice level").selectOption("B1");
  await cafe.getByLabel("Maximum hints").fill("0");
  await cafe.getByRole("button", { name: "Practise this course", exact: true }).click();
  await expect(page.getByText("Using your configured course template.")).toBeVisible();
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ordering at a cafe · B1", exact: true }),
  ).toBeVisible();
  const checkpoint = await page.evaluate(() =>
    JSON.parse(
      JSON.parse(sessionStorage.getItem("language-lab-e2e-state")!).trainingCheckpoints[0].payload,
    ),
  );
  expect(checkpoint.state.courseTemplate.teachingPolicy.maxHints).toBe(0);
});

test("connected AI rejects invented citations, then completes a free-form lesson without persisting keys", async ({
  page,
}) => {
  let invalidCitation = true;
  await page.route("http://localhost:11434/v1/chat/completions", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST",
          "access-control-allow-headers": "authorization,content-type",
        },
      });
      return;
    }
    const body = route.request().postDataJSON();
    const system = body.messages[0].content as string;
    let output: unknown;
    if (system.startsWith("Assess only")) {
      const input = JSON.parse(body.messages[1].content);
      const message = input.transcript.at(-1);
      output = {
        stageId: input.stage.id,
        criteria: input.stage.successCriteria.map((_: string, criterionIndex: number) => ({
          criterionIndex,
          met: true,
          evidence: [
            {
              messageSeq: message.seq,
              quote: invalidCitation ? "invented learner quote" : message.content,
            },
          ],
        })),
        feedback: "All criteria demonstrated with learner evidence.",
      };
    } else if (system.includes("diagnosing a student utterance")) {
      output = { errors: [], fluency: "fluent", intent: "practise the scene" };
    } else if (system.includes("assessing a finished lesson")) {
      output = {
        score: 88,
        summary: "You met the course goals.",
        strengths: ["polite ordering"],
        improvements: ["try a different order"],
      };
    } else
      output = {
        reply: system.includes("Current stage: Choose size and milk")
          ? "What size and milk would you like?"
          : system.includes("Current stage: Confirm the order")
            ? "Is that for here or to go?"
            : "Thank you. Your order is confirmed.",
        tone: "encouraging",
      };
    await route.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*" },
      contentType: "application/json",
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }),
    });
  });
  await configureAiConnection(page, {
    model: "test-model",
    apiKey: "test-secret-should-stay-in-keyring",
  });
  await page.getByLabel("Practice mode").selectOption("ai");
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
  const replies = [
    "Could I have a latte and a muffin, please?",
    "Do you have oat milk? A regular latte with oat milk, please.",
    "To go, please. Yes, that order is right, thank you.",
  ];
  await page.getByLabel("Your reply").fill(replies[0]!);
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("quote an existing learner message exactly");
  await expect(page.getByText("Current step: Order politely", { exact: true })).toBeVisible();
  invalidCitation = false;
  for (let index = 0; index < replies.length; index++) {
    await page.getByLabel("Your reply").fill(replies[index]!);
    await page.getByRole("button", { name: "Send reply", exact: true }).click();
    await expect(page.getByLabel("Learning feedback")).toContainText(replies[index]!);
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Finish and review", exact: true }).click();
  await expect(page.getByLabel("Lesson review")).toContainText("88/100");
  const persisted = await page.evaluate(() => sessionStorage.getItem("language-lab-e2e-state"));
  expect(persisted).not.toContain("test-secret-should-stay-in-keyring");
  expect(persisted).not.toContain('"apiKey"');
});
