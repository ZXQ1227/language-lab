import { expect, test } from "@playwright/test";
import { installTauriMock } from "./helpers/tauri-mock";
import { openWorkspacePage } from "./helpers/navigation";

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
});

test("shows the three learning workspaces in a sidebar on a wide window", async ({ page }) => {
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.getByText("Sayden", { exact: true })).toBeVisible();
  const logo = sidebar.locator("img");
  await expect(logo).toBeVisible();
  await expect
    .poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav).toHaveCSS("position", "static");
  await expect(nav.getByRole("button")).toHaveText(["Home", "Review", "My learning"]);
  await expect(nav.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("heading", { name: "Learning plan", level: 1 })).toBeVisible();
  await expect(page.getByText("Completed lessons will appear here.")).toBeVisible();
});

test("keeps the compact dock visible and groups practice under the Home library", async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 600 });
  const dock = page.getByRole("navigation", { name: "Main navigation" });
  const homeTabs = page.getByRole("navigation", { name: "Section navigation" });
  const library = page.getByRole("navigation", { name: "Practice categories" });
  await expect(dock).toHaveCSS("position", "fixed");
  await expect(dock.getByRole("button")).toHaveText(["Home", "Review", "My learning"]);
  await expect(dock).toBeInViewport({ ratio: 1 });
  await expect(homeTabs.getByRole("button")).toHaveText(["Plan", "Course library"]);
  await homeTabs.getByRole("button", { name: "Course library" }).click();
  await expect(library.getByRole("button")).toHaveText([
    "Scenario dialogues",
    "Guided practice",
    "Listening & discussion",
  ]);
  await expect(library.getByRole("button", { name: "Scenario dialogues" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const lastCourse = page
    .getByRole("region", { name: "Travel & stays" })
    .getByRole("article")
    .last();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect
    .poll(async () => {
      const [courseBounds, dockBounds] = await Promise.all([
        lastCourse.boundingBox(),
        dock.boundingBox(),
      ]);
      return dockBounds!.y - (courseBounds!.y + courseBounds!.height);
    })
    .toBeGreaterThan(0);
  await expect(dock).toBeInViewport({ ratio: 1 });
  await library.getByRole("button", { name: "Guided practice" }).click();
  await expect(page.getByRole("heading", { name: "Guided Hotel Check-in" })).toBeVisible();
  await page.getByRole("button", { name: "Set up lesson", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Hotel Check-in ·/ })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(library.getByRole("button", { name: "Guided practice" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.setViewportSize({ width: 1120, height: 760 });
  await expect(dock).toHaveCSS("position", "static");
  await expect(page.getByRole("heading", { name: "Guided Hotel Check-in" })).toBeVisible();
  await dock.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review", exact: true })).toBeVisible();
  await dock.getByRole("button", { name: "My learning", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My learning", exact: true })).toBeVisible();
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

test("course library lists the five ordered paths and opens a bundled lesson offline", async ({
  page,
}) => {
  await openWorkspacePage(page, "Scenarios");
  const paths = page.getByRole("group", { name: "Learning paths", exact: true });
  const choices = [
    "Travel & stays",
    "Career development",
    "Study & campus life",
    "Living abroad",
    "Everyday conversation",
  ];
  await expect(paths.getByRole("button")).toHaveText(choices);
  const travel = page.getByRole("region", { name: choices[0], exact: true });
  await expect(travel.getByRole("article")).toHaveCount(9);
  await expect(travel.getByRole("heading", { level: 2 }).first()).toHaveText(
    "Checking in for a flight",
  );
  await expect(travel.getByText("Ordering at a cafe")).toBeVisible();
  await expect(travel.getByText("Hotel Check-in", { exact: true })).toBeVisible();
  await expect(travel.getByText("latte", { exact: true })).toBeVisible();
  await paths.getByRole("button", { name: choices[2], exact: true }).click();
  await expect(page.getByText("Clarifying an essay at office hours")).toBeVisible();
  await paths.getByRole("button", { name: choices[3], exact: true }).click();
  await expect(page.getByText("Seeing a doctor")).toBeVisible();
  await paths.getByRole("button", { name: choices[4], exact: true }).click();
  await expect(page.getByText("Small talk with a colleague")).toBeVisible();

  await paths.getByRole("button", { name: choices[1], exact: true }).click();
  const recruiter = page
    .getByRole("article")
    .filter({ hasText: "Taking a recruiter screening call" });
  await recruiter.getByRole("button", { name: "Set up lesson", exact: true }).click();
  await expect(page.getByLabel("Practice mode")).toHaveValue("demo");
  await page.getByText("Lesson reference", { exact: true }).click();
  await page.getByText(/^Useful expressions/).click();
  await expect(page.getByText("我有五年产品管理经验。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
  await expect(page.getByLabel("Conversation")).toContainText(
    "Tell me a bit about your experience.",
  );
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
