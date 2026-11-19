import { expect, test } from "@playwright/test";
import { installTauriMock } from "./helpers/tauri-mock";
import { openCourseTopic, openWorkspacePage } from "./helpers/navigation";

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
  await expect(paths.getByRole("article")).toHaveCount(15);
  const travel = page.getByRole("region", { name: choices[0], exact: true });
  const airport = travel.getByRole("button", { name: "Airports & transport", exact: true });
  await expect
    .poll(() => airport.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  for (const [topicName, title, count] of [
    ["Airports & transport", "Checking in for a flight", 2],
    ["Accommodation & visitor help", "Hotel Check-in", 4],
    ["Dining & shopping", "Ordering at a cafe", 3],
    ["Talking to teachers", "Clarifying an essay at office hours", 1],
    ["Health & care", "Seeing a doctor", 2],
    ["Meeting people", "Small talk with a colleague", 2],
  ] as const) {
    const topic = await openCourseTopic(page, topicName);
    await expect(topic.getByRole("article")).toHaveCount(count);
    await expect(topic.getByRole("heading", { name: title, exact: true })).toBeVisible();
    if (topicName === "Dining & shopping")
      await expect(topic.getByText("latte", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: topicName, exact: true })).toBeFocused();
  }

  const jobs = await openCourseTopic(page, "Job search");
  const recruiter = jobs
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

test("difficulty filters topics, lesson counts and all three library tabs", async ({ page }) => {
  await openWorkspacePage(page, "Scenarios");
  const filter = page.getByRole("combobox", { name: "Difficulty", exact: true });
  const categories = page.getByRole("navigation", { name: "Practice categories" });
  const health = page.getByRole("button", { name: "Health & care", exact: true });
  await expect(filter).toHaveValue("all");
  await expect(health).toHaveAccessibleDescription("2 lessons A2 · B1");
  await filter.selectOption("intermediate");
  await expect(page.getByRole("region", { name: "Travel & stays" })).toHaveCount(0);
  await expect(health).toHaveAccessibleDescription("1 lesson B1");
  const topic = await openCourseTopic(page, "Health & care");
  await expect(topic.getByRole("article")).toHaveCount(1);
  await expect(
    topic.getByRole("heading", { name: "Describing a pet's symptoms at the vet" }),
  ).toBeVisible();
  await topic.getByRole("button", { name: "Close", exact: true }).click();
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
  ).toHaveCount(15);
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
