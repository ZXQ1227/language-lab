import { expect, test, type Page } from "@playwright/test";
import { installTauriMock } from "./helpers/tauri-mock";

async function setSystem(page: Page, systemLocale: string, regionLocale = systemLocale) {
  await page.evaluate(
    async ({ systemLocale, regionLocale }) => {
      await window.__llInvoke("test_set_system_locale", { systemLocale, regionLocale });
    },
    { systemLocale, regionLocale },
  );
}
async function preferences(page: Page) {
  return page.evaluate(() => {
    const state = JSON.parse(sessionStorage.getItem("language-lab-e2e-state")!);
    return (state.trainingCheckpoints ?? []).filter(
      (row: { type: string }) => row.type === "locale_settings",
    );
  });
}
for (const [locale, language, settings, heading] of [
  ["zh-CN", "zh-CN", "设置", "界面语言"],
  ["zh-Hant-HK", "zh-TW", "設定", "介面語言"],
  ["en-GB", "en-US", "Settings", "Interface language"],
  ["fr-FR", "en-US", "Settings", "Interface language"],
]) {
  test(`starts from OS ${locale} without a language wizard`, async ({ page }) => {
    await installTauriMock(page, {
      systemLocale: locale,
      regionLocale: "en-GB",
      lessons: [],
      scenarios: [],
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", language!);
    await page.getByRole("button", { name: settings, exact: true }).click();
    await expect(page.getByRole("combobox", { name: heading!, exact: true })).toBeDisabled();
    expect(await preferences(page)).toEqual([]);
    await expect(page.getByText(`(${locale})`, { exact: true })).toBeVisible();
  });
}

test("persists manual override, ignores OS changes, and re-reads when following system again", async ({
  page,
}) => {
  await installTauriMock(page, { systemLocale: "zh-CN", lessons: [], scenarios: [] });
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByLabel("跟随系统", { exact: true }).uncheck();
  await expect(page.getByRole("combobox", { name: "界面语言", exact: true })).toBeEnabled();
  await page.getByRole("combobox", { name: "界面语言", exact: true }).selectOption("en-US");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await setSystem(page, "zh-TW");
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await expect(
    page.getByRole("checkbox", { name: "Follow system", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("checkbox", { name: "Follow system", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
  await expect(page.getByRole("combobox", { name: "介面語言", exact: true })).toBeDisabled();
  const rows = await preferences(page);
  expect(rows).toHaveLength(1);
  expect(JSON.parse(rows[0].payload)).toEqual({ version: 1, localeMode: "system" });
  await setSystem(page, "en-US");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
});

test("failed preference writes keep the current language and show a translated retry", async ({
  page,
}) => {
  await installTauriMock(page, { systemLocale: "zh-CN", lessons: [], scenarios: [] });
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.evaluate(() => window.__llInvoke("test_fail_next_locale_settings"));
  await page.getByLabel("跟随系统", { exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("无法保存语言更改");
  await expect(page.getByLabel("跟随系统", { exact: true })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  expect(await preferences(page)).toEqual([]);
});

test("interface changes preserve an active course, draft and learning language", async ({
  page,
}) => {
  await installTauriMock(page, { systemLocale: "en-US", lessons: [], scenarios: [] });
  await page.goto("/");
  await page.getByRole("button", { name: "Training", exact: true }).click();
  await page.getByRole("combobox", { name: "Course", exact: true }).selectOption("hotel-checkin");
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
  const draft = page.locator("textarea").first();
  await draft.fill("I have a reservation under Chen.");
  const original = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem("language-lab-e2e-state")!).trainingCheckpoints,
  );
  await setSystem(page, "zh-CN");
  await page.evaluate(() => window.dispatchEvent(new Event("languagechange")));
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(draft).toHaveValue("I have a reservation under Chen.");
  const after = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem("language-lab-e2e-state")!).trainingCheckpoints,
  );
  expect(after).toEqual(original);
  await expect(
    page.getByRole("heading", { name: "Hotel Check-in · A2", exact: true }),
  ).toBeVisible();
});
