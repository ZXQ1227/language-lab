import { expect, test } from "@playwright/test";
import { installTauriMock } from "./helpers/tauri-mock";
import { openWorkspacePage } from "./helpers/navigation";

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
});

test("shows the four learning workspaces and the plan at startup", async ({ page }) => {
  await expect(page.getByText("Sayden · 言港", { exact: true })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("button")).toHaveText([
    "Home",
    "Conversation",
    "Review",
    "My learning",
  ]);
  await expect(nav.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("heading", { name: "Learning plan", level: 1 })).toBeVisible();
  await expect(page.getByText("Completed lessons will appear here.")).toBeVisible();
});

test("keeps each original page reachable through its workspace", async ({ page }) => {
  for (const [subpage, heading] of [
    ["Scenarios", "Scenarios"],
    ["Training", "Training"],
    ["Reports", "Reports"],
    ["Review", "Review"],
    ["Learning memory", "Learning memory"],
    ["Settings", "Settings"],
  ]) {
    await openWorkspacePage(page, subpage!);
    await expect(page.getByRole("heading", { name: heading, level: 1, exact: true })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Section navigation" }).locator('[aria-current="page"]'),
    ).toHaveCount(1);
  }
});

test("settings shows system diagnostics, database location and keyring note", async ({ page }) => {
  await openWorkspacePage(page, "Settings");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.locator("code", { hasText: "0.0.1-e2e" })).toBeVisible();
  await expect(page.locator("code", { hasText: "playwright" })).toBeVisible();
  await expect(page.locator("code", { hasText: ":e2e-mock:" })).toBeVisible();
  await expect(
    page.getByText(/API keys are stored in the OS keyring through the Rust core/),
  ).toBeVisible();
});

test("course library shows bundled scenarios after content sync", async ({ page }) => {
  await openWorkspacePage(page, "Scenarios");
  await expect(page.getByText("Ordering at a cafe")).toBeVisible();
  await expect(page.getByText("Seeing a doctor")).toBeVisible();
  await expect(page.getByText("Small talk with a colleague")).toBeVisible();
  await expect(page.getByText("Hotel Check-in", { exact: true })).toBeVisible();
  await expect(page.getByText("latte", { exact: true })).toBeVisible();
});

test("degrades gracefully when the IPC bridge is unavailable", async ({ page }) => {
  const bare = await page.context().newPage();
  await bare.goto("/");
  await expect(bare.getByRole("heading", { name: "Learning plan" })).toBeVisible();
  await openWorkspacePage(bare, "Settings");
  const alert = bare.getByRole("region", { name: "System diagnostics" }).getByRole("alert");
  await expect(alert).toContainText("System check failed");
  await expect(alert.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await bare.close();
});
