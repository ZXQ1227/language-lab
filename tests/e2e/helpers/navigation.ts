import type { Page } from "@playwright/test";

const sections: Record<string, readonly [string, string]> = {
  Scenarios: ["Home", "Course library"],
  Training: ["Conversation", "Training"],
  Review: ["Review", "Practice queue"],
  Reports: ["Review", "Reports"],
  "Learning memory": ["My learning", "Learning memory"],
  Settings: ["My learning", "Settings"],
};

export async function openWorkspacePage(page: Page, name: string) {
  const route = sections[name];
  if (!route) {
    await page.getByRole("button", { name, exact: true }).click();
    return;
  }
  const [section, subpage] = route;
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: section, exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Section navigation" })
    .getByRole("button", { name: subpage, exact: true })
    .click();
}
