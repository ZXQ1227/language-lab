import { expect, test, type Page } from "@playwright/test";
import { configureAiConnection, installTauriMock } from "./helpers/tauri-mock";
import { openWorkspacePage } from "./helpers/navigation";

const endpoint = "http://localhost:11434/v1/chat/completions";
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const reply = (page: Page) => page.getByRole("textbox", { name: "Your reply", exact: true });
const transfer = "Try it in a new situation";

test("free chat keeps the draft, validates hints, continues the topic and restores transfer evidence", async ({
  page,
}) => {
  await installTauriMock(page);
  const intended = "我想说我负责设计手机应用";
  const example = "I design mobile apps at work.";
  const answer = "I design apps for phones.";
  const newAnswer = "I work on the design of apps for phones.";
  const feedback = "What kind of mobile apps do you design?";
  let hints = 0;
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
    const instruction = messages[0].content;
    const input = messages.at(-1).content;
    let output: object;
    if (instruction.startsWith("Help the learner")) {
      expect(JSON.parse(input).draft).toBe(intended);
      if (!response_format) {
        await route.fulfill({
          headers,
          json: { choices: [{ message: { content: "" }, finish_reason: "stop" }] },
        });
        return;
      }
      output =
        ++hints === 1
          ? { example: "" }
          : { intent: "Describe your work as an app designer.", example };
    } else if (instruction.startsWith("Check whether")) {
      output = { result: "met", quote: JSON.parse(input).reply };
    } else if (instruction.startsWith("Write one short speaking task")) {
      output = {
        situation: "You are meeting a new neighbour. Tell them what you do for work.",
        criterion: "Say that you design mobile apps.",
        example: "I work as a mobile app designer.",
      };
    } else {
      expect(input).toBe(answer);
      output = { reply: feedback, vocabulary: ["apps"] };
    }
    await route.fulfill({
      headers,
      json: { choices: [{ message: { content: JSON.stringify(output) }, finish_reason: "stop" }] },
    });
  });
  await page.goto("/");
  await configureAiConnection(page, { model: "test-contextual-practice" });
  await openWorkspacePage(page, "Home");
  await button(page, "Free conversation").click();
  await reply(page).fill(intended);
  await button(page, "Give me a line").click();
  await expect(page.getByRole("alert")).toContainText(
    "The AI service didn’t return a usable example",
  );
  await expect(reply(page)).toHaveValue(intended);
  await button(page, "Give me a line").click();
  await expect(page.getByText(example, { exact: true })).toBeVisible();
  await expect(reply(page)).toHaveValue(intended);
  await button(page, "Give me a line").click();
  expect(hints).toBe(2);
  await reply(page).fill(answer);
  await button(page, "Send reply").click();
  await expect(page.getByText(feedback)).toBeVisible();
  const entry = page.getByRole("listitem").filter({ hasText: answer });
  await entry.getByRole("button", { name: transfer }).click();
  const modal = page.getByRole("dialog", { name: transfer });
  await expect(modal).toContainText("You are meeting a new neighbour");
  await expect(modal.getByText("I work as a mobile app designer.")).toHaveCount(0);
  await modal.getByRole("textbox", { name: "Your reply" }).fill(newAnswer);
  await modal.getByRole("button", { name: "Send reply" }).click();
  await expect(modal).toContainText("Completed independently");
  await modal.getByRole("button", { name: "Close practice" }).click();
  await button(page, "Exit conversation").click();
  await openWorkspacePage(page, "Learning memory");
  await page
    .getByRole("region", { name: "Episodic memory" })
    .getByRole("button", { name: "Open source conversation", exact: true })
    .click();
  await entry.getByRole("button", { name: transfer }).click();
  await expect(modal).toContainText("Completed independently");
});

async function startHotel(page: Page) {
  await openWorkspacePage(page, "Training");
  if (await button(page, "New lesson").isVisible()) await button(page, "New lesson").click();
  await page.getByRole("combobox", { name: "Course", exact: true }).selectOption("hotel-checkin");
  await button(page, "Start lesson").click();
  await expect(reply(page)).toBeVisible();
}

async function sendSuggested(page: Page) {
  await button(page, "Use suggested reply").click();
  await button(page, "Send reply").click();
  await expect(reply(page)).toHaveValue("");
}

async function finishHotel(page: Page, rounds: number) {
  // The final successful turn swaps the composer for the debrief.
  for (let i = 0; i < rounds - 1; i++) await sendSuggested(page);
  await button(page, "Use suggested reply").click();
  await button(page, "Send reply").click();
  await button(page, "Finish and review").click();
  await expect(page.getByLabel("Lesson review", { exact: true })).toBeVisible();
}

test("offers authored Hotel Check-in practice offline and distinguishes assisted answers", async ({
  page,
}) => {
  await installTauriMock(page);
  let network = 0;
  await page.route(endpoint, (route) => {
    network++;
    return route.abort();
  });
  await page.goto("/");
  await startHotel(page);
  for (let i = 0; i < 3; i++) await sendSuggested(page);
  await reply(page).fill("我想先寄存行李");
  await button(page, "Give me a line").click();
  const example = "Could I leave my bags here until check-in?";
  await expect(page.getByText(example, { exact: true })).toBeVisible();
  await expect(reply(page)).toHaveValue("我想先寄存行李");
  await reply(page).fill(example);
  await button(page, "Send reply").click();
  await expect(page.getByText(/We can keep your bags at the front desk/)).toBeVisible();
  await expect(reply(page)).toHaveValue("");
  await finishHotel(page, 2);
  await button(page, transfer).click();
  const modal = page.getByRole("dialog", { name: transfer });
  await expect(modal).toContainText("You have just checked out");
  await expect(modal.getByText("Could you keep my luggage until four?")).toHaveCount(0);
  await modal.getByRole("button", { name: "Give me a line", exact: true }).click();
  await expect(modal.getByText("Could you keep my luggage until four?")).toBeVisible();
  await modal
    .getByRole("textbox", { name: "Your reply" })
    .fill("Could you hold my suitcase until four?");
  await modal.getByRole("button", { name: "Send reply" }).click();
  await expect(modal).toContainText("Completed with a hint");
  expect(network).toBe(0);
});

test("filters historical speaking practice through the memory switch and source deletion", async ({
  page,
}) => {
  await installTauriMock(page);
  await page.goto("/");
  await startHotel(page);
  await button(page, "Give me a line").click();
  await expect(
    page.getByText("Hello, I have a reservation under Alex Chen for two nights."),
  ).toBeVisible();
  await sendSuggested(page);
  await finishHotel(page, 4);
  await expect(button(page, transfer)).toBeVisible();
  await startHotel(page);
  await finishHotel(page, 5);
  await expect(button(page, transfer)).toBeVisible();

  await openWorkspacePage(page, "Learning memory");
  const enabled = page.getByRole("checkbox", { name: "Use learning memory across sessions" });
  await enabled.uncheck();
  const episodes = page.getByRole("region", { name: "Episodic memory" });
  await episodes.getByRole("button", { name: "Open source lesson", exact: true }).first().click();
  await expect(page.getByLabel("Lesson review", { exact: true })).toBeVisible();
  await expect(button(page, transfer)).toHaveCount(0);
  await openWorkspacePage(page, "Learning memory");
  await enabled.check();
  const lessons = episodes.getByRole("button", { name: "Open source lesson", exact: true });
  await lessons.first().click();
  await expect(button(page, transfer)).toBeVisible();
  await openWorkspacePage(page, "Learning memory");
  await episodes.getByRole("button", { name: "Delete source", exact: true }).last().click();
  await button(page, "Permanently delete").click();
  await expect(lessons).toHaveCount(1);
  await lessons.first().click();
  await expect(page.getByLabel("Lesson review", { exact: true })).toBeVisible();
  await expect(button(page, transfer)).toHaveCount(0);
});

test("recovers from an endpoint that rejects JSON mode and keeps save failures distinct", async ({
  page,
}) => {
  await installTauriMock(page);
  const draft = "我想聊聊我的工作";
  const example = "I’d like to talk about my work.";
  const answer = "Can we talk about my job?";
  const formats: (string | undefined)[] = [];
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
    const instruction = messages[0].content;
    let content: string;
    if (instruction.startsWith("Help the learner")) {
      formats.push(response_format?.type);
      expect(JSON.parse(messages.at(-1).content).draft).toBe(draft);
      if (response_format) {
        await route.fulfill({
          status: 400,
          headers,
          json: { error: { message: "response_format json_object is not supported" } },
        });
        return;
      }
      content = example;
    } else if (instruction.startsWith("Check whether")) {
      content = JSON.stringify({ result: "met", quote: answer });
    } else {
      content = JSON.stringify({ reply: "What do you do for work?" });
    }
    await route.fulfill({
      headers,
      json: { choices: [{ message: { content }, finish_reason: "stop" }] },
    });
  });

  await page.goto("/");
  await configureAiConnection(page, { model: "test-json-mode-incompatible" });
  await openWorkspacePage(page, "Home");
  await button(page, "Free conversation").click();
  await reply(page).fill(draft);
  await button(page, "Give me a line").click();
  await expect(page.getByText(example, { exact: true })).toBeVisible();
  await expect(reply(page)).toHaveValue(draft);
  expect(formats).toEqual(["json_object", undefined]);

  await reply(page).fill(answer);
  await button(page, "Send reply").click();
  await expect(page.getByText("What do you do for work?", { exact: true })).toBeVisible();
  await expect(reply(page)).toHaveValue("");
  await reply(page).fill(draft);
  await page.evaluate(() => window.__llInvoke("test_fail_next_memory"));
  await button(page, "Give me a line").click();
  await expect(page.getByRole("alert")).toContainText(
    "The example couldn’t be saved on this device",
  );
  await expect(reply(page)).toHaveValue(draft);
  await button(page, "Give me a line").click();
  await expect(page.getByText(example, { exact: true })).toBeVisible();
  await expect(reply(page)).toHaveValue(draft);
});
