import { expect, test, type Page } from "@playwright/test";
import { configureAiConnection, installTauriMock } from "./helpers/tauri-mock";
import { openWorkspacePage } from "./helpers/navigation";

const endpoint = "http://localhost:11434/v1/chat/completions";
const greeting = "Hey, What’s on your mind today?";
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const localRows = (page: Page) =>
  page.evaluate(
    () =>
      (JSON.parse(sessionStorage.getItem("language-lab-e2e-state")!).trainingCheckpoints ?? []) as {
        type: string;
        payload: string;
      }[],
  );

test("opens Zoi from a floating Home entry before any AI connection is configured", async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 600 });
  await installTauriMock(page);
  let requests = 0;
  await page.route(endpoint, (route) => {
    requests++;
    return route.abort();
  });
  await page.goto("/");
  const launch = button(page, "Free conversation");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(launch).toBeInViewport({ ratio: 1 });
  await expect(nav).toBeInViewport({ ratio: 1 });
  await expect
    .poll(async () => {
      const [entry, dock] = await Promise.all([launch.boundingBox(), nav.boundingBox()]);
      return dock!.y - (entry!.y + entry!.height);
    })
    .toBeGreaterThan(0);
  await launch.click();
  await expect(page.getByRole("heading", { name: "Free conversation", exact: true })).toBeFocused();
  await expect(page.getByRole("list", { name: "Conversation", exact: true })).toContainText(
    greeting,
  );
  await expect(nav).toHaveCount(0);
  await expect(button(page, "Set up AI for conversation")).toBeVisible();
  await expect(button(page, "Send reply")).toBeDisabled();
  await button(page, "Exit conversation").click();
  await expect(launch).toBeVisible();
  expect(requests).toBe(0);
  expect(await localRows(page)).toEqual([]);
});

test("continues the work conversation when the second turn returns blank JSON replies", async ({
  page,
}) => {
  await installTauriMock(page);
  const first = "We can talk about my job";
  const second = "I'm a Product manager";
  const third = "I work on mobile apps.";
  const fourth = "I enjoy interviewing users.";
  const questions = [
    "Nice! What do you do for work?",
    "What kind of products do you manage?",
    "What do you enjoy about working on mobile apps?",
  ];
  const secondTurnCalls: boolean[] = [];
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
    const { messages, response_format } = route.request().postDataJSON();
    const input = messages.at(-1).content;
    const structured = response_format?.type === "json_object";
    let content: string;
    if (input === second) {
      secondTurnCalls.push(structured);
      expect(messages.slice(1)).toEqual([
        { role: "assistant", content: greeting },
        { role: "user", content: first },
        { role: "assistant", content: questions[0] },
        { role: "user", content: second },
      ]);
      content = structured ? " \n   " : questions[1]!;
    } else if (input === fourth) {
      content = " ";
    } else {
      if (input === third)
        expect(messages.slice(-3)).toEqual([
          { role: "user", content: second },
          { role: "assistant", content: questions[1] },
          { role: "user", content: third },
        ]);
      expect(structured).toBe(true);
      content = JSON.stringify(
        input === first
          ? { reply: questions[0] }
          : { reply: questions[2], vocabulary: ["mobile apps"] },
      );
    }
    await route.fulfill({
      headers,
      json: { choices: [{ message: { content }, finish_reason: "stop" }] },
    });
  });
  await page.goto("/");
  await configureAiConnection(page, { model: "test-blank-json" });
  await openWorkspacePage(page, "Home");
  await button(page, "Free conversation").click();
  const conversation = page.getByRole("list", { name: "Conversation", exact: true });
  const draft = page.getByRole("textbox", { name: "Your reply", exact: true });
  for (const [index, utterance] of [first, second, third].entries()) {
    await draft.fill(utterance);
    await button(page, "Send reply").click();
    await expect(conversation).toContainText(questions[index]!);
    await expect(draft).toHaveValue("");
  }
  expect(secondTurnCalls).toEqual([true, true, true, false]);
  await draft.fill(fourth);
  await button(page, "Send reply").click();
  await expect(page.getByRole("alert")).toContainText("didn’t return a usable reply");
  await expect(draft).toHaveValue(fourth);
  await expect(conversation.getByRole("listitem")).toHaveCount(7);
  const rows = await localRows(page);
  const checkpoint = JSON.parse(
    rows.find((row) => row.type === "free_conversation_checkpoint")!.payload,
  );
  const memory = JSON.parse(rows.find((row) => row.type === "free_conversation_memory")!.payload);
  expect(checkpoint.turns).toHaveLength(3);
  expect(checkpoint.turns[1]).toEqual({ utterance: second, reply: questions[1], vocabulary: [] });
  expect(memory.totalTurns).toBe(3);
  expect(memory.knowledge).toEqual([expect.objectContaining({ term: "mobile apps" })]);
});

test("saves only grounded free conversation practice, retries atomically and reopens after restart", async ({
  page,
}) => {
  await installTauriMock(page);
  const requests: { role: string; content: string }[][] = [];
  let finishLateReply!: () => void;
  const lateReply = new Promise<void>((resolve) => {
    finishLateReply = resolve;
  });
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
    const { messages, response_format } = route.request().postDataJSON();
    expect(response_format).toEqual({ type: "json_object" });
    requests.push(messages);
    const turn = requests.length;
    if (turn === 4) await lateReply;
    const replies = [
      { reply: " " },
      {
        reply: "What did you see on your walk?",
        vocabulary: ["walk", "invented phrase"],
        diagnosis: {
          intent: "describe an outing",
          errors: [
            {
              category: "tense",
              original: "goed",
              corrected: "went",
              explanation: "Go has an irregular past tense.",
              confidence: "high",
            },
          ],
        },
      },
      {
        reply: "That sounds peaceful.",
        vocabulary: ["heron"],
        diagnosis: {
          intent: "describe a bird",
          errors: [
            {
              category: "grammar",
              original: "never said this",
              corrected: "something else",
              explanation: "Invalid evidence",
              confidence: "high",
            },
          ],
        },
      },
      { reply: "Late reply" },
    ];
    await route
      .fulfill({
        headers,
        json: { choices: [{ message: { content: JSON.stringify(replies[turn - 1]) } }] },
      })
      .catch((error: unknown) => {
        if (turn !== 4) throw error;
      });
  });

  try {
    await page.goto("/");
    await configureAiConnection(page, { model: "test-free-conversation" });
    await openWorkspacePage(page, "Home");
    await button(page, "Free conversation").click();
    const log = page.getByLabel("Conversation", { exact: true });
    const draft = page.getByRole("textbox", { name: "Your reply", exact: true });
    const first = "I goed for a walk.";
    const second = "I saw a heron by the river.";
    await draft.fill(first);
    await button(page, "Send reply").click();
    await expect(page.getByRole("alert")).toHaveText(
      "The AI service didn’t return a usable reply. Your draft is still here. Try sending it again.",
    );
    await expect(draft).toHaveValue(first);
    await expect(log.getByRole("listitem")).toHaveCount(1);
    await page.evaluate(() => window.__llInvoke("test_fail_next_memory"));
    await button(page, "Send reply").click();
    await expect(page.getByRole("alert")).toContainText("The conversation could not be saved");
    await expect(draft).toHaveValue(first);
    expect(await localRows(page)).toEqual([]);
    await button(page, "Send reply").click();
    await expect(log).toContainText("What did you see on your walk?");
    expect(requests).toHaveLength(2);
    await expect(draft).toHaveValue("");
    await draft.fill(second);
    await button(page, "Send reply").click();
    await expect(log).toContainText("That sounds peaceful.");
    expect(requests[2]?.[0]?.content).toContain('"corrections":["goed → went"]');
    expect(requests[2]?.slice(1)).toEqual([
      { role: "assistant", content: greeting },
      { role: "user", content: first },
      { role: "assistant", content: "What did you see on your walk?" },
      { role: "user", content: second },
    ]);
    await draft.fill("Another message.");
    await button(page, "Send reply").click();
    await expect.poll(() => requests.length).toBe(4);
    await button(page, "Exit conversation").click();
    await button(page, "Free conversation").click();
    await expect(log.getByRole("listitem")).toHaveCount(1);
    await expect(log).toContainText(greeting);
    const rows = await localRows(page);
    expect(rows.map((row) => row.type).sort()).toEqual([
      "free_conversation_checkpoint",
      "free_conversation_memory",
    ]);
    const memory = JSON.parse(rows.find((row) => row.type === "free_conversation_memory")!.payload);
    expect(
      memory.knowledge.map((item: { term: string; usedTurns: number }) => [
        item.term,
        item.usedTurns,
      ]),
    ).toEqual([
      ["walk", 1],
      ["heron", 1],
    ]);
    expect(memory.errors).toEqual([
      expect.objectContaining({ original: "goed", corrected: "went", count: 1 }),
    ]);
    await page.reload();
    await openWorkspacePage(page, "Learning memory");
    const episode = page.getByRole("region", { name: "Episodic memory", exact: true });
    await expect(episode).toContainText("Practice replies: 2");
    await episode.getByRole("button", { name: "Open source conversation", exact: true }).click();
    await expect(log).toContainText(second);
    await expect(log.getByRole("listitem")).toHaveCount(5);
    await button(page, "Exit conversation").click();
    await expect(episode).toBeVisible();
  } finally {
    finishLateReply();
  }
});

test("distinguishes a saved connection from a verified response and preserves an unsent draft", async ({
  page,
}) => {
  await installTauriMock(page);
  let probes = 0;
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
    const isProbe = messages.length === 1;
    if (isProbe) {
      expect(messages).toEqual([
        { role: "system", content: 'Reply only with this JSON object: {"ok":true}' },
      ]);
      probes++;
    }
    const content = isProbe ? { ok: probes > 1 } : { reply: "" };
    await route.fulfill({
      headers,
      json: { choices: [{ message: { content: JSON.stringify(content) } }] },
    });
  });
  await page.goto("/");
  await configureAiConnection(page, { model: "test-provider" });
  await openWorkspacePage(page, "Home");
  await button(page, "Free conversation").click();
  const draft = page.getByRole("textbox", { name: "Your reply", exact: true });
  await draft.fill("I would like to talk about my weekend.");
  await button(page, "Send reply").click();
  await expect(button(page, "Open built-in guided practice")).toBeVisible();
  await button(page, "Set up AI for conversation").click();
  await expect(page.getByText(/Saved connection\. Test it/)).toBeVisible();
  await button(page, "Test AI connection").click();
  await expect(page.getByRole("alert")).toContainText("failed validation");
  await button(page, "Test AI connection").click();
  await expect(page.getByText("AI connection verified.", { exact: true })).toBeVisible();
  await openWorkspacePage(page, "Home");
  await button(page, "Free conversation").click();
  await expect(draft).toHaveValue("I would like to talk about my weekend.");
});

test("persists the memory switch, resumes current context and deletes a selected source", async ({
  page,
}) => {
  await installTauriMock(page);
  const requests: { role: string; content: string }[][] = [];
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
    requests.push(route.request().postDataJSON().messages);
    await route.fulfill({
      headers,
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: "What was it like?",
                vocabulary: ["pangolin"],
              }),
            },
          },
        ],
      },
    });
  });
  const send = async (text: string) => {
    const draft = page.getByRole("textbox", { name: "Your reply", exact: true });
    await draft.fill(text);
    await button(page, "Send reply").click();
    await expect(draft).toHaveValue("");
  };
  await page.goto("/");
  await configureAiConnection(page, { model: "test-memory-controls" });
  await openWorkspacePage(page, "Home");
  await button(page, "Free conversation").click();
  await send("I saw a pangolin.");
  await button(page, "Exit conversation").click();
  await openWorkspacePage(page, "Learning memory");

  const reuse = page.getByRole("checkbox", { name: "Use learning memory across sessions" });
  await expect(reuse).toBeChecked();
  await reuse.uncheck();
  await expect(reuse).not.toBeChecked();
  await page.reload();
  await openWorkspacePage(page, "Learning memory");
  await expect(reuse).toBeEnabled();
  await expect(reuse).not.toBeChecked();
  await page
    .getByRole("region", { name: "Episodic memory" })
    .getByRole("button", { name: "Open source conversation", exact: true })
    .click();
  await send("It was near the trail.");
  expect(requests[1]![0]!.content).not.toContain("pangolin");
  expect(requests[1]!.slice(1)).toContainEqual({ role: "user", content: "I saw a pangolin." });

  await button(page, "Exit conversation").click();
  await button(page, "Delete source").click();
  const count = (await localRows(page)).length;
  expect(count).toBe(2);
  await button(page, "Cancel").click();
  expect(await localRows(page)).toHaveLength(count);
  await button(page, "Delete source").click();
  await button(page, "Permanently delete").click();
  await expect(button(page, "Open source conversation")).toHaveCount(0);
  expect(await localRows(page)).toEqual([]);
  await page.reload();
  await openWorkspacePage(page, "Learning memory");
  await expect(button(page, "Open source conversation")).toHaveCount(0);
  await expect(reuse).not.toBeChecked();
});
