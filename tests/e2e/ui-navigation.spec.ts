// UI navigation tests for the desktop shell: sidebar routing across all five
// pages plus graceful degradation when the IPC bridge is unavailable.

import { expect, test } from "@playwright/test";
import { installTauriMock } from "./helpers/tauri-mock";

const PAGES = [
  "Dashboard",
  "Scenarios",
  "Training",
  "Learning memory",
  "Reports",
  "Settings",
] as const;

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
});

test("shows the app shell with sidebar navigation", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Language Lab", level: 1 })).toBeHidden();
  await expect(page.getByText("Language Lab", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  for (const label of PAGES) {
    await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
});

test("navigates through every page via the sidebar", async ({ page }) => {
  for (const label of PAGES) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByRole("heading", { name: label, level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
});

test("dashboard shows system status from mocked IPC", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.locator("code", { hasText: "0.0.1-e2e" })).toBeVisible();
  await expect(page.locator("code", { hasText: "playwright" })).toBeVisible();
});

test("settings shows the database location and keyring note", async ({ page }) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.locator("code", { hasText: ":e2e-mock:" })).toBeVisible();
  await expect(page.getByText(/OS keyring/)).toBeVisible();
});

test("scenarios page shows the bundled scenario library after content sync", async ({ page }) => {
  await page.getByRole("button", { name: "Scenarios", exact: true }).click();
  // Startup sync upserts the bundled scenarios into the mock DB.
  await expect(page.getByText("Ordering at a cafe")).toBeVisible();
  await expect(page.getByText("Seeing a doctor")).toBeVisible();
  await expect(page.getByText("Small talk with a colleague")).toBeVisible();
  await expect(page.getByText("Hotel Check-in", { exact: true })).toBeVisible();
  await expect(page.getByText("latte", { exact: true })).toBeVisible();
});

test("degrades gracefully when the IPC bridge is unavailable", async ({ page }) => {
  // Fresh page without the mock: invoke() rejects, dashboard must show an
  // error banner with a retry button, not a crash.
  const bare = await page.context().newPage();
  await bare.goto("/");
  await expect(bare.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(bare.getByRole("alert")).toContainText("System check failed");
  await expect(bare.getByRole("button", { name: "Retry" })).toBeVisible();
  await bare.close();
});
