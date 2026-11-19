import { openWorkspacePage } from "./helpers/navigation";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { configureAiConnection, installTauriMock } from "./helpers/tauri-mock";

test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  },
});
declare global {
  interface Window {
    __speechProbe: { streams: MediaStream[]; played: number; urls: number; revoked: number };
  }
}
const endpoint = "http://localhost:9191/v1";
const nav = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).click();
const rows = (page: Page) =>
  page.evaluate(
    () =>
      [
        ...(JSON.parse(sessionStorage.getItem("language-lab-e2e-state")!).trainingCheckpoints ??
          []),
        ...(JSON.parse(sessionStorage.getItem("language-lab-e2e-state")!).settingsRows ?? []),
      ] as {
        type: string;
        payload: string;
      }[],
  );
const checkpoint = async (page: Page) =>
  JSON.parse((await rows(page)).find((r) => r.type === "training_checkpoint")!.payload);
async function configure(page: Page, playback = true) {
  await openWorkspacePage(page, "Settings");
  await page.getByRole("checkbox", { name: "Enable speech recognition", exact: true }).check();
  await page.getByRole("combobox", { name: "Recognition", exact: true }).selectOption("provider");
  await page.getByRole("textbox", { name: "ASR endpoint", exact: true }).fill(endpoint);
  if (playback) {
    await page
      .getByRole("combobox", { name: "Reply playback", exact: true })
      .selectOption("provider");
    await page.getByRole("textbox", { name: "TTS endpoint", exact: true }).fill(endpoint);
    await page
      .getByRole("checkbox", { name: "Read new saved partner replies automatically", exact: true })
      .check();
  } else
    await page.getByRole("combobox", { name: "Reply playback", exact: true }).selectOption("off");
  await nav(page, "Save speech settings");
  await expect(page.getByLabel("Speech settings").getByRole("status")).toContainText(
    "saved on this device",
  );
}
async function start(page: Page) {
  await openWorkspacePage(page, "Training");
  await nav(page, "Start lesson");
  await expect(page.getByRole("button", { name: "Record reply", exact: true })).toBeEnabled();
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toBeHidden();
}
async function record(page: Page) {
  await nav(page, "Record reply");
  await expect(page.getByLabel("Voice input").getByRole("status")).toContainText("Recording…");
  // Capture one actual MediaRecorder timeslice from Chromium's fake microphone.
  await page.waitForTimeout(350);
  await nav(page, "Stop and recognize");
}
test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.addInitScript(() => {
    window.__speechProbe = { streams: [], played: 0, urls: 0, revoked: 0 };
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (options) => {
      const stream = await original(options);
      window.__speechProbe.streams.push(stream);
      return stream;
    };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = async function () {
      await play.call(this);
      window.__speechProbe.played++;
    };
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      window.__speechProbe.urls++;
      return create(blob);
    };
    URL.revokeObjectURL = (url) => {
      window.__speechProbe.revoked++;
      revoke(url);
    };
  });
  await page.goto("/");
});

test("sends reviewed speech to Zoi only after the learner confirms and sends it", async ({
  page,
}) => {
  await configureAiConnection(page, { model: "test-free-conversation-voice" });
  await configure(page, false);
  const outgoing: string[] = [];
  await page.route(`${endpoint}/audio/transcriptions`, (route) =>
    route.fulfill({
      headers: { "access-control-allow-origin": "*" },
      json: { text: "I saw a rabbit." },
    }),
  );
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
    outgoing.push(route.request().postDataJSON().messages.at(-1).content);
    await route.fulfill({
      headers,
      json: {
        choices: [{ message: { content: JSON.stringify({ reply: "Where did you see it?" }) } }],
      },
    });
  });
  await openWorkspacePage(page, "Home");
  await nav(page, "Free conversation");
  await record(page);
  const recognized = page.getByRole("textbox", { name: "Recognized speech", exact: true });
  await expect(recognized).toHaveValue("I saw a rabbit.");
  await recognized.fill("I saw a hare.");
  await nav(page, "Use transcript");
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue(
    "I saw a hare.",
  );
  expect(outgoing).toEqual([]);
  await nav(page, "Send reply");
  await expect(page.getByRole("list", { name: "Conversation", exact: true })).toContainText(
    "Where did you see it?",
  );
  expect(outgoing).toEqual(["I saw a hare."]);
  expect((await rows(page)).some(({ type }) => type === "training_checkpoint")).toBe(false);
});

test("records, reviews, commits confirmed speech and plays the saved partner reply without storing audio", async ({
  page,
}) => {
  const silence = await readFile("tests/fixtures/speech-silence.mp3");
  let recognitionCalls = 0,
    speechCalls = 0;
  await page.route(`${endpoint}/audio/transcriptions`, async (route) => {
    recognitionCalls++;
    expect(route.request().headers()["content-type"]).toContain("multipart/form-data");
    await route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ text: "A latte and a muffin please.", confidence: 0.55 }),
    });
  });
  await page.route(`${endpoint}/audio/speech`, async (route) => {
    if (route.request().method() === "OPTIONS")
      return route.fulfill({
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST",
          "access-control-allow-headers": "content-type",
        },
      });
    speechCalls++;
    expect(route.request().postDataJSON().voice).toBe("role-female-test");
    await route.fulfill({
      contentType: "audio/mpeg",
      headers: { "access-control-allow-origin": "*" },
      body: silence,
    });
  });
  await configure(page);
  await page
    .getByRole("textbox", { name: "Female voice ID", exact: true })
    .fill("role-female-test");
  await nav(page, "Save speech settings");
  await start(page);
  await record(page);
  const recognized = page.getByRole("textbox", { name: "Recognized speech", exact: true });
  await expect(recognized).toHaveValue("A latte and a muffin please.");
  await expect(page.getByLabel("Voice input")).toContainText("Low recognition confidence");
  expect((await checkpoint(page)).state.turnCount).toBe(0);
  await recognized.fill("A latte and a muffin, please.");
  await nav(page, "Use transcript");
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue(
    "A latte and a muffin, please.",
  );
  await page.evaluate(() => window.__llInvoke("test_fail_next_checkpoint"));
  await nav(page, "Send reply");
  await expect(page.getByRole("alert")).toContainText("Injected checkpoint write failure");
  expect(speechCalls).toBe(0);
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue(
    "A latte and a muffin, please.",
  );
  await nav(page, "Send reply");
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue("");
  await expect.poll(() => speechCalls).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__speechProbe.played)).toBe(1);
  const saved = await checkpoint(page);
  expect(saved.messages[1]).toMatchObject({
    content: "A latte and a muffin, please.",
    speech: { edited: true, confidence: 0.55, language: "en" },
  });
  expect(saved.state.turnCount).toBe(1);
  expect(recognitionCalls).toBe(1);
  expect(JSON.stringify(await rows(page))).not.toMatch(/base64|recording\.webm|audio\/mpeg/);
  expect(
    await page.evaluate(() =>
      window.__speechProbe.streams.every((s) =>
        s.getTracks().every((t) => t.readyState === "ended"),
      ),
    ),
  ).toBe(true);
  await nav(page, "Read latest partner reply");
  await expect.poll(() => speechCalls).toBe(2);
  expect((await checkpoint(page)).state.turnCount).toBe(1);
  await page.reload();
  await openWorkspacePage(page, "Training");
  await expect(page.getByLabel("Conversation")).toContainText("speech transcript · edited");
  expect(speechCalls).toBe(2);
});

test("reads Zoi with the installed female voice and restores a manual male override", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {
        voice?: { name: string };
        constructor(readonly text: string) {}
      },
    });
    Object.defineProperty(window, "speechSynthesis", {
      value: Object.assign(new EventTarget(), {
        getVoices: () => [
          { name: "Daniel", lang: "en-US", localService: true, default: true },
          { name: "Samantha", lang: "en-US", localService: true },
        ],
        speak: (utterance: SpeechSynthesisUtterance) =>
          sessionStorage.setItem("selected-device-voice", utterance.voice?.name ?? ""),
        cancel() {},
      }),
    });
  });
  await page.reload();
  await openWorkspacePage(page, "Training");
  await nav(page, "Start lesson");
  await expect(page.getByLabel("Conversation").getByText("Zoi", { exact: true })).toBeVisible();
  const selected = () => page.evaluate(() => sessionStorage.getItem("selected-device-voice"));
  await nav(page, "Read latest partner reply");
  await expect.poll(selected).toBe("Samantha");

  await openWorkspacePage(page, "Settings");
  const mode = page.getByRole("combobox", { name: "Voice selection", exact: true });
  await expect(mode).toHaveValue("auto");
  await mode.selectOption("male");
  await nav(page, "Save speech settings");
  await expect(page.getByLabel("Speech settings").getByRole("status")).toContainText(
    "saved on this device",
  );
  await page.reload();
  await openWorkspacePage(page, "Settings");
  await expect(mode).toHaveValue("male");
  await openWorkspacePage(page, "Training");
  await nav(page, "Read latest partner reply");
  await expect.poll(selected).toBe("Daniel");
});

test("retries ASR explicitly, preserves an existing draft and cleans up recording on navigation", async ({
  page,
}) => {
  let attempts = 0;
  await page.route(`${endpoint}/audio/transcriptions`, async (route) => {
    attempts++;
    await route.fulfill({
      status: attempts === 1 ? 503 : 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: attempts === 1 ? "private provider error" : '{"text":"Please make it small."}',
    });
  });
  await configure(page, false);
  await start(page);
  await nav(page, "Keyboard");
  await page
    .getByRole("textbox", { name: "Your reply", exact: true })
    .fill("I would like a latte.");
  await record(page);
  await expect(page.getByRole("alert")).toContainText("HTTP 503");
  await nav(page, "Retry recognition");
  await expect(page.getByRole("textbox", { name: "Recognized speech", exact: true })).toHaveValue(
    "Please make it small.",
  );
  await nav(page, "Append transcript to draft");
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue(
    "I would like a latte.\nPlease make it small.",
  );
  expect(attempts).toBe(2);
  expect((await checkpoint(page)).state.turnCount).toBe(0);
  await nav(page, "Record reply");
  await expect(page.getByLabel("Voice input").getByRole("status")).toContainText("Recording…");
  await openWorkspacePage(page, "Reports");
  expect(
    await page.evaluate(() =>
      window.__speechProbe.streams.every((s) =>
        s.getTracks().every((t) => t.readyState === "ended"),
      ),
    ),
  ).toBe(true);
  expect(attempts).toBe(2);
});

test("denied microphone and failed TTS retain the text conversation and allow independent retry", async ({
  page,
}) => {
  let speechCalls = 0;
  const silence = await readFile("tests/fixtures/speech-silence.mp3");
  await page.route(`${endpoint}/audio/speech`, async (route) => {
    if (route.request().method() === "OPTIONS")
      return route.fulfill({
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST",
          "access-control-allow-headers": "content-type",
        },
      });
    speechCalls++;
    await route.fulfill({
      status: speechCalls === 1 ? 500 : 200,
      contentType: speechCalls === 1 ? "text/plain" : "audio/mpeg",
      headers: { "access-control-allow-origin": "*" },
      body: speechCalls === 1 ? "failure" : silence,
    });
  });
  await configure(page);
  await start(page);
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("denied", "NotAllowedError");
    };
  });
  await nav(page, "Record reply");
  await expect(page.getByRole("alert")).toContainText("Microphone access was denied");
  await nav(page, "Keyboard");
  await page
    .getByRole("textbox", { name: "Your reply", exact: true })
    .fill("A latte and a muffin, please.");
  await nav(page, "Send reply");
  await expect(page.getByLabel("Speech playback").getByRole("alert")).toContainText("HTTP 500");
  const saved = await checkpoint(page);
  expect(saved.state.turnCount).toBe(1);
  expect(saved.messages[1].speech).toBeUndefined();
  await nav(page, "Read latest partner reply");
  await expect.poll(() => page.evaluate(() => window.__speechProbe.played)).toBe(1);
  expect(speechCalls).toBe(2);
  expect((await checkpoint(page)).state.turnCount).toBe(1);
});

test("saves preferences without keys, rolls back a settings failure and restores nonsecret configuration", async ({
  page,
}) => {
  await configure(page, false);
  const before = await rows(page);
  await page.getByRole("textbox", { name: "ASR model", exact: true }).fill("another-asr-model");
  await page.evaluate(() => window.__llInvoke("test_fail_next_speech_settings"));
  await nav(page, "Save speech settings");
  await expect(page.getByLabel("Speech settings").getByRole("alert")).toContainText(
    "could not be saved",
  );
  expect(await rows(page)).toEqual(before);
  await nav(page, "Save speech settings");
  await expect(page.getByLabel("Speech settings").getByRole("status")).toContainText(
    "saved on this device",
  );
  await page.reload();
  await openWorkspacePage(page, "Settings");
  await expect(page.getByRole("textbox", { name: "ASR model", exact: true })).toHaveValue(
    "another-asr-model",
  );
  expect((await rows(page)).filter((r) => r.type === "voice_settings")).toHaveLength(1);
});
