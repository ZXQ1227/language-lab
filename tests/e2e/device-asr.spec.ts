import { openWorkspacePage } from "./helpers/navigation";
import { expect, test, type Page } from "@playwright/test";
import { installTauriMock } from "./helpers/tauri-mock";

test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  },
});

const nav = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).click();

async function enableDeviceRecognition(page: Page) {
  await openWorkspacePage(page, "Settings");
  await page.getByRole("checkbox", { name: "Enable speech recognition", exact: true }).check();
  // Device is the default mode: no endpoint or key fields are shown.
  await expect(page.getByRole("combobox", { name: "Recognition", exact: true })).toHaveValue(
    "device",
  );
  await expect(page.getByRole("textbox", { name: "ASR endpoint", exact: true })).toBeHidden();
  await nav(page, "Save speech settings");
  await expect(page.getByLabel("Speech settings").getByRole("status")).toContainText(
    "saved on this device",
  );
}

async function startLesson(page: Page) {
  await openWorkspacePage(page, "Training");
  await nav(page, "Start lesson");
  await expect(page.getByRole("button", { name: "Record reply", exact: true })).toBeEnabled();
}

async function record(page: Page) {
  await nav(page, "Record reply");
  await expect(page.getByLabel("Voice input").getByRole("status")).toContainText("Recording…");
  await page.waitForTimeout(350);
  await nav(page, "Stop and recognize");
}

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
});

test("recognizes speech with the built-in device recognizer and never touches an endpoint", async ({
  page,
}) => {
  let httpTranscriptionRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/audio/transcriptions")) httpTranscriptionRequests++;
  });
  await enableDeviceRecognition(page);
  await startLesson(page);
  await record(page);
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue(
    "A latte and a muffin please.",
  );
  await nav(page, "Send reply");
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue("");
  expect(httpTranscriptionRequests).toBe(0);
  await page.reload();
  await openWorkspacePage(page, "Training");
  await expect(page.getByLabel("Conversation")).toContainText("speech transcript");
});

test("surfaces device recognition failures and retries through the same path", async ({ page }) => {
  await enableDeviceRecognition(page);
  await startLesson(page);
  await page.evaluate(() => window.__llInvoke("test_fail_next_device_transcribe"));
  await record(page);
  await expect(page.getByRole("alert")).toContainText("Injected device recognition failure");
  await expect(page.getByRole("button", { name: "Retry recognition", exact: true })).toBeEnabled();
  await nav(page, "Retry recognition");
  await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue(
    "A latte and a muffin please.",
  );
});
