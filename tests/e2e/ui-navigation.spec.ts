// UI navigation smoke tests for the desktop shell.
// The shell is still a placeholder; these pin the render contract that real
// pages (dashboard / scenarios / training / reports / settings) will extend.

import { expect, test } from "@playwright/test";
import { installTauriMock } from "./helpers/tauri-mock";

test.describe("shell navigation", () => {
  test("renders the app shell with health check from mocked IPC", async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Language Lab" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "IPC health check" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Local database" })).toBeVisible();

    // Health data arrived over the mocked IPC bridge.
    await expect(page.locator("code", { hasText: "ok" }).first()).toBeVisible();
    await expect(page.locator("code", { hasText: "0.0.1-e2e" })).toBeVisible();
  });

  test("shows migrations and table counts from db_status", async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");

    await expect(page.locator("code", { hasText: "11" })).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator("code", { hasText: ":e2e-mock:" })).toBeVisible();
  });

  test("degrades gracefully when the IPC bridge is unavailable", async ({ page }) => {
    // No mock installed: in a bare browser window.__TAURI_INTERNALS__ does
    // not exist, so invoke() rejects. The shell must show an error, not crash.
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Language Lab" })).toBeVisible();
    await expect(page.getByText(/IPC error:/)).toBeVisible();
    await expect(page.getByText(/DB error:/)).toBeVisible();
  });
});
