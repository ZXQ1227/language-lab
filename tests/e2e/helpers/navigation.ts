import type { Page } from "@playwright/test";

const sections: Record<string, readonly [string, string]> = {
  Scenarios: ["Home", "Course library"],
  Training: ["Home", "Course library"],
  Review: ["Review", "Practice queue"],
  Reports: ["Review", "Reports"],
  "Learning memory": ["My learning", "Learning memory"],
  Settings: ["My learning", "Settings"],
};

export async function openWorkspacePage(page: Page, name: string) {
  const main = page.getByRole("navigation", { name: "Main navigation" });
  const exit = page.getByRole("button", { name: "Exit lesson", exact: true });
  if ((await exit.isVisible()) && !(await main.isVisible())) {
    if (name === "Training") return;
    await exit.click();
  }
  const route = sections[name];
  if (!route) {
    await page.getByRole("button", { name, exact: true }).click();
    return;
  }
  const [section, subpage] = route;
  await main.getByRole("button", { name: section, exact: true }).click();
  await page
    .getByRole("navigation", { name: "Section navigation" })
    .getByRole("button", { name: subpage, exact: true })
    .click();
  if (name === "Training") {
    await page.getByRole("button", { name: "Scenario roleplay", exact: true }).click();
  }
}

export async function openLibraryLesson(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
  return page.getByRole("dialog", { name, exact: true });
}
