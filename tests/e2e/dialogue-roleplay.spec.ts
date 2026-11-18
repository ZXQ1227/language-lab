import { openWorkspacePage } from "./helpers/navigation";
import { expect, test, type Page } from "@playwright/test";
import hotel from "../../content/scenarios/hotel-checkin.json";
import { configureAiConnection, installTauriMock } from "./helpers/tauri-mock";

async function openHotel(page: Page) {
  await installTauriMock(page);
  await page.goto("/");
  await openWorkspacePage(page, "Training");
  // Configure the AI connection before picking the course: navigating to
  // Settings resets this page's local course selection state.
  await configureAiConnection(page, { model: "test-character" });
  await page.getByRole("combobox", { name: "Course", exact: true }).selectOption("hotel-checkin");
}

async function mockAi(
  page: Page,
  reply: (body: { messages: { role: string; content: string }[] }) => unknown,
) {
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
    const output = system.includes("diagnosing a student utterance")
      ? { errors: [], fluency: "fluent", intent: "check in" }
      : system.startsWith("Assess only")
        ? (() => {
            const input = JSON.parse(body.messages[1].content);
            return {
              stageId: input.stage.id,
              criteria: input.stage.successCriteria.map((_: string, criterionIndex: number) => ({
                criterionIndex,
                met: false,
                evidence: [],
              })),
              feedback: "Please provide your reservation name and stay length.",
            };
          })()
        : reply(body);
    await route.fulfill({
      status: 200,
      headers,
      contentType: "application/json",
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }),
    });
  });
  await page.getByLabel("Practice mode").selectOption("ai");
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
}

const checkpoint = (page: Page) =>
  page.evaluate(() =>
    JSON.parse(
      JSON.parse(sessionStorage.getItem("language-lab-e2e-state")!).trainingCheckpoints[0].payload,
    ),
  );

test("guided repeat and hint preserve an unsent draft and never complete an objective", async ({
  page,
}) => {
  await openHotel(page);
  await openWorkspacePage(page, "Scenarios");
  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Hotel Check-in", exact: true }) });
  await card.getByText("Configure course", { exact: true }).click();
  await card.getByLabel("Maximum hints").fill("1");
  await card.getByRole("button", { name: "Practise this course", exact: true }).click();
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
  const draft = "I have a reservation under Alex Chen.";
  await page.getByRole("textbox", { name: "Your reply", exact: true }).fill(draft);
  await page.getByRole("button", { name: "Repeat last reply", exact: true }).click();
  await expect(
    page.getByLabel("Conversation").getByText(hotel.courseTemplate.openingLine, { exact: true }),
  ).toHaveCount(2);
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue(draft);
  await page.getByRole("button", { name: "Give me a hint", exact: true }).click();
  await expect(page.getByRole("button", { name: "Give me a hint", exact: true })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue(draft);
  const saved = await checkpoint(page);
  expect(
    saved.state.objectives.every((objective: { completed: boolean }) => !objective.completed),
  ).toBe(true);
  expect(saved.state.vocabularySeen).toEqual({});
  expect(saved.state.hintsGiven).toBe(1);
  expect(saved.messages[1].purpose).toBe("support");
  expect(saved.messages[3].purpose).toBe("support");
  await page.reload();
  await openWorkspacePage(page, "Training");
  await expect(page.getByRole("button", { name: "Give me a hint", exact: true })).toBeDisabled();
  await expect(
    page.getByText("Current step: Find your reservation", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Use simpler English", exact: true })).toHaveCount(
    0,
  );
});

test("connected dialogue restores preferences, simplifies and repeats without losing the character or facts", async ({
  page,
}) => {
  await openHotel(page);
  let replies = 0;
  const prompts: string[] = [];
  const preference = "I would prefer a quiet room.";
  const updated = "Actually, I would prefer a room near the elevator.";
  await mockAi(page, (body) => {
    replies++;
    const system = body.messages[0]!.content;
    prompts.push(system);
    if (system.includes("The learner requested simpler English"))
      return {
        reply: "A quiet room is ready. What is your booking name?",
        tone: "neutral",
        move: "simplify",
      };
    const utterance = body.messages.at(-1)!.content;
    const seq = Number(system.match(/Current learner message number: (\d+)/)![1]);
    return {
      reply:
        utterance === preference
          ? "A quiet room is available. What name is your reservation under?"
          : utterance === updated
            ? "I have noted your updated preference. How long are you staying?"
            : "Breakfast is included, from seven to ten. I have noted your quiet-room preference; what name is the booking under?",
      tone: "encouraging",
      move: "follow_up",
      memoryUpdates:
        utterance === preference || utterance === updated
          ? [{ id: "room-preference", messageSeq: seq, quote: utterance }]
          : [],
    };
  });
  await page.getByRole("textbox", { name: "Your reply", exact: true }).fill(preference);
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByLabel("Conversation")).toContainText("A quiet room is available");
  await page.getByRole("textbox", { name: "Your reply", exact: true }).fill("An unsent answer");
  await page.getByRole("button", { name: "Use simpler English", exact: true }).click();
  await expect(page.getByLabel("Conversation")).toContainText("A quiet room is ready");
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue(
    "An unsent answer",
  );
  await page.getByRole("button", { name: "Repeat last reply", exact: true }).click();
  await expect(
    page
      .getByLabel("Conversation")
      .getByText("A quiet room is ready. What is your booking name?", { exact: true }),
  ).toHaveCount(2);
  expect(replies).toBe(2);
  await page.reload();
  await openWorkspacePage(page, "Training");
  await page
    .getByRole("textbox", { name: "Your reply", exact: true })
    .fill("What time is breakfast?");
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByLabel("Conversation")).toContainText(
    "Breakfast is included, from seven to ten",
  );
  expect(prompts.at(-1)).toContain(preference);
  expect(prompts.at(-1)).toContain("Character: Maya");
  await page.getByRole("textbox", { name: "Your reply", exact: true }).fill(updated);
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByLabel("Conversation")).toContainText("updated preference");
  const saved = await checkpoint(page);
  expect(saved.state.dialogueMemory).toHaveLength(1);
  expect(saved.state.dialogueMemory[0].quote).toBe(updated);
  expect(saved.state.courseTemplate.character.name).toBe("Maya");
  expect(
    saved.state.courseTemplate.learningPack.scenarioFacts.find(
      (item: { label: string }) => item.label === "Room and directions",
    ).value,
  ).toBe("Room 412; fourth floor; elevator to the left");
  expect(
    saved.state.objectives.every((objective: { completed: boolean }) => !objective.completed),
  ).toBe(true);
});

test("duplicate repair and failed writes do not publish uncommitted replies or memory", async ({
  page,
}) => {
  await openHotel(page);
  let strategy = "repair";
  let calls = 0;
  await mockAi(page, (body) => {
    calls++;
    if (strategy === "stuck" || (strategy === "repair" && calls === 1))
      return {
        reply: [...body.messages.slice(1, -1)]
          .reverse()
          .find((message) => message.role === "assistant")!.content,
        tone: "neutral",
      };
    const utterance = body.messages.at(-1)!.content;
    const seq = Number(
      body.messages[0]!.content.match(/Current learner message number: (\d+)/)![1],
    );
    return {
      reply:
        calls === 2
          ? "What name is your reservation under?"
          : "I have your new preference. How many nights are you staying?",
      tone: "encouraging",
      move: "follow_up",
      memoryUpdates: [{ id: "room-preference", messageSeq: seq, quote: utterance }],
    };
  });
  const first = "I would prefer a quiet room.";
  await page.getByRole("textbox", { name: "Your reply", exact: true }).fill(first);
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByLabel("Conversation")).toContainText(
    "What name is your reservation under?",
  );
  expect(calls).toBe(2);
  const initial = await checkpoint(page);
  strategy = "stuck";
  const updated = "Actually, I prefer a room near the elevator.";
  await page.getByRole("textbox", { name: "Your reply", exact: true }).fill(updated);
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("repeated its reply");
  expect(calls).toBe(4);
  expect(await checkpoint(page)).toEqual(initial);
  strategy = "clean";
  await page.evaluate(() => window.__llInvoke("test_fail_next_checkpoint"));
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Injected checkpoint write failure");
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue(updated);
  expect((await checkpoint(page)).state.dialogueMemory[0].quote).toBe(first);
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue("");
  const saved = await checkpoint(page);
  expect(saved.state.turnCount).toBe(2);
  expect(saved.messages).toHaveLength(5);
  expect(saved.state.dialogueMemory[0].quote).toBe(updated);
});
