import { expect, test } from "@playwright/test";
import { configureAiConnection, installTauriMock } from "./helpers/tauri-mock";

const endpoint = "http://localhost:11434/v1/chat/completions";
const greeting = "Hey, What’s on your mind today?";

test("shows the free conversation greeting translation beside Read and respects language settings", async ({
  page,
}) => {
  await installTauriMock(page, { systemLocale: "zh-CN", lessons: [], scenarios: [] });
  let modelCalls = 0;
  await page.route(endpoint, (route) => {
    modelCalls++;
    return route.abort();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "自由对话", exact: true }).click();
  const bubble = page.getByRole("listitem").filter({ hasText: greeting });
  const translate = bubble.getByRole("button", { name: "翻译 1", exact: true });
  const read = bubble.getByRole("button", { name: "朗读消息 1", exact: true });
  await expect(translate).toBeVisible();
  expect((await translate.boundingBox())!.x).toBeGreaterThan((await read.boundingBox())!.x);
  await translate.click();
  await expect(bubble.locator('p[lang="zh-CN"]')).toHaveText("嗨，你今天在想什么？");
  await expect(bubble.getByText(greeting, { exact: true })).toBeVisible();
  await bubble.getByRole("button", { name: "隐藏译文 1", exact: true }).click();
  await expect(bubble.locator('p[lang="zh-CN"]')).toBeHidden();

  await page.getByRole("button", { name: "退出对话", exact: true }).click();
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByLabel("跟随系统", { exact: true }).uncheck();
  await page.getByRole("combobox", { name: "界面语言", exact: true }).selectOption("zh-TW");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
  await page.getByRole("button", { name: "首頁", exact: true }).click();
  await page.getByRole("button", { name: "自由對話", exact: true }).click();
  await bubble.getByRole("button", { name: "翻譯 1", exact: true }).click();
  await expect(bubble.locator('p[lang="zh-TW"]')).toHaveText("嗨，你今天在想什麼？");
  expect(modelCalls).toBe(0);
});

test("translates only the selected training message, retries invalid JSON, and leaves practice intact", async ({
  page,
}) => {
  await installTauriMock(page, { systemLocale: "en-US", lessons: [], scenarios: [] });
  const requests: { role: string; content: string }[][] = [];
  const translated = "歡迎來到我們的咖啡館。請問您想點什麼？";
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
    await route.fulfill({
      headers,
      json: {
        choices: [
          {
            message: {
              content:
                requests.length === 1 ? "not JSON" : JSON.stringify({ translation: translated }),
            },
          },
        ],
      },
    });
  });
  await page.goto("/");
  await configureAiConnection(page, { model: "test-translation" });
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
  const bubble = page
    .getByRole("list", { name: "Conversation", exact: true })
    .getByRole("listitem")
    .first();
  const original = await bubble.locator('p[lang="en"]').innerText();
  const checkpoints = () =>
    page.evaluate(
      () => JSON.parse(sessionStorage.getItem("language-lab-e2e-state")!).trainingCheckpoints,
    );
  const saved = await checkpoints();

  await page.evaluate(async () => {
    await window.__llInvoke("test_set_system_locale", {
      systemLocale: "zh-Hant-HK",
      regionLocale: "zh-HK",
    });
    window.dispatchEvent(new Event("languagechange"));
  });
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
  const localizedBubble = page
    .getByRole("list", { name: "對話", exact: true })
    .getByRole("listitem")
    .first();
  expect(requests).toHaveLength(0);
  await localizedBubble.getByRole("button", { name: "翻譯 1", exact: true }).click();
  await expect(localizedBubble.getByRole("alert")).toHaveText("這則訊息翻譯失敗。");
  await localizedBubble.getByRole("button", { name: "重新翻譯", exact: true }).click();
  await expect(localizedBubble.locator('p[lang="zh-TW"]')).toHaveText(translated);
  await expect(localizedBubble.locator('p[lang="en"]')).toHaveText(original);
  await localizedBubble.getByRole("button", { name: "隱藏譯文 1", exact: true }).click();
  await expect(localizedBubble.locator('p[lang="zh-TW"]')).toBeHidden();
  await localizedBubble.getByRole("button", { name: "翻譯 1", exact: true }).click();
  await expect(localizedBubble.locator('p[lang="zh-TW"]')).toHaveText(translated);
  expect(requests).toHaveLength(2);
  for (const messages of requests) {
    expect(messages).toEqual([
      { role: "system", content: expect.stringContaining("Traditional Chinese (zh-TW)") },
      { role: "user", content: original },
    ]);
  }
  await page.evaluate(async () => {
    await window.__llInvoke("test_set_system_locale", {
      systemLocale: "en-GB",
      regionLocale: "en-GB",
    });
    window.dispatchEvent(new Event("languagechange"));
  });
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await expect(page.getByText(translated, { exact: true })).toHaveCount(0);
  await bubble.getByRole("button", { name: "Translate 1", exact: true }).click();
  await expect(bubble.locator('p[lang="en-US"]')).toHaveText(original);
  expect(requests).toHaveLength(2);
  expect(await checkpoints()).toEqual(saved);
});
