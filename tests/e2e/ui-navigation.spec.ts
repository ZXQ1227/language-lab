import { expect, test } from "@playwright/test";
import { installTauriMock } from "./helpers/tauri-mock";
import { openLibraryLesson, openWorkspacePage } from "./helpers/navigation";

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
    .getByRole("region", { name: "Everyday conversation", exact: true })
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
  await page.setViewportSize({ width: 600, height: 760 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWorkspacePage(page, "Scenarios");
  const paths = page.getByRole("group", { name: "Learning paths", exact: true });
  const choices = [
    "Travel & stays",
    "Career development",
    "Study & campus life",
    "Living abroad",
    "Everyday conversation",
  ];
  await expect(paths.getByRole("heading", { level: 2 })).toHaveText(choices);
  await expect(paths.getByRole("article")).toHaveCount(41);
  for (const [index, count] of [9, 9, 6, 10, 7].entries()) {
    const path = paths.getByRole("region", { name: choices[index], exact: true });
    await expect(path.getByRole("article")).toHaveCount(count);
    await expect(path.getByText(`${count} lessons`, { exact: true })).toBeVisible();
  }
  const travel = page.getByRole("region", { name: choices[0], exact: true });
  const airport = travel.getByRole("button", { name: "Checking in for a flight", exact: true });
  await expect
    .poll(() => airport.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  const lastLesson = travel.getByRole("button", {
    name: "Getting a local recommendation",
    exact: true,
  });
  const previous = travel.getByRole("button", { name: "Previous lessons", exact: true });
  const next = travel.getByRole("button", { name: "Next lessons", exact: true });
  const travelRow = travel.locator("#course-path-travel-row");
  await expect(lastLesson).not.toBeInViewport();
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(previous).toBeEnabled();
  await previous.click();
  await expect(previous).toBeDisabled();
  await travelRow.hover();
  await page.mouse.wheel(4000, 0);
  await expect(lastLesson).toBeInViewport({ ratio: 1 });
  await expect(next).toBeDisabled();
  await expect
    .poll(() => page.locator("#course-path-career-row").evaluate((row) => row.scrollLeft))
    .toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(600);

  for (const title of [
    "Getting a local recommendation",
    "Hotel Check-in",
    "Ordering at a cafe",
    "Clarifying an essay at office hours",
    "Seeing a doctor",
    "Small talk with a colleague",
  ]) {
    const lesson = await openLibraryLesson(page, title);
    await expect(lesson.getByRole("heading", { name: title, exact: true })).toBeVisible();
    if (title === "Ordering at a cafe")
      await expect(lesson.getByText("latte", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: title, exact: true })).toBeFocused();
  }

  const recruiter = await openLibraryLesson(page, "Taking a recruiter screening call");
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

test("difficulty filters lesson cards, row counts and all three library tabs", async ({ page }) => {
  await openWorkspacePage(page, "Scenarios");
  const filter = page.getByRole("combobox", { name: "Difficulty", exact: true });
  const categories = page.getByRole("navigation", { name: "Practice categories" });
  const health = page.getByRole("button", { name: "Seeing a doctor", exact: true });
  const living = page.getByRole("region", { name: "Living abroad", exact: true });
  await expect(filter).toHaveValue("all");
  await expect(health).toHaveAccessibleDescription("Health & care A2");
  await expect(living.getByRole("article")).toHaveCount(10);
  await filter.selectOption("intermediate");
  await expect(page.getByRole("region", { name: "Travel & stays" })).toHaveCount(0);
  await expect(health).toHaveCount(0);
  await expect(living.getByRole("article")).toHaveCount(5);
  await expect(living.getByText("5 lessons", { exact: true })).toBeVisible();
  const lesson = await openLibraryLesson(page, "Describing a pet's symptoms at the vet");
  await expect(
    lesson.getByRole("heading", { name: "Describing a pet's symptoms at the vet" }),
  ).toBeVisible();
  await lesson.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Scenario roleplay", exact: true }).click();
  const course = page.getByRole("combobox", { name: "Course", exact: true });
  await expect(course.getByRole("option")).toHaveCount(21);
  await expect(course.getByRole("option", { name: "Hotel Check-in" })).toHaveCount(0);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await categories.getByRole("button", { name: "Listening & discussion" }).click();
  await expect(filter).toHaveValue("intermediate");
  await expect(course.getByRole("option")).toHaveCount(21);
  await expect(course.getByRole("option", { name: "Hotel Check-in" })).toHaveCount(0);
  await categories.getByRole("button", { name: "Guided practice" }).click();
  await expect(page.getByText("No lessons match this difficulty.")).toBeVisible();
  await filter.selectOption("beginner");
  await expect(page.getByRole("heading", { name: "Guided Hotel Check-in" })).toBeVisible();
  await categories.getByRole("button", { name: "Scenario dialogues" }).click();
  await expect(filter).toHaveValue("beginner");
  await expect(page.getByRole("region", { name: "Career development" })).toHaveCount(0);
  await filter.selectOption("advanced");
  await expect(page.getByText("No lessons match this difficulty.")).toBeVisible();
  await filter.selectOption("all");
  await expect(
    page.getByRole("group", { name: "Learning paths" }).getByRole("article"),
  ).toHaveCount(41);
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
