import { expect, test } from "@playwright/test";
import { openWorkspacePage } from "./helpers/navigation";
import { installTauriMock } from "./helpers/tauri-mock";

test("previews the course, keeps reply controls within the window and resumes saved dialogue", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await installTauriMock(page);
  await page.goto("/");
  await openWorkspacePage(page, "Training");
  const preview = page.getByRole("region", { name: "What you’ll practise" });
  await expect(preview.getByText("latte", { exact: true })).toBeVisible();
  await expect(
    preview
      .getByRole("listitem")
      .filter({ hasText: /Could I have/ })
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  const transcript = page.getByLabel("Conversation", { exact: true });
  const dock = page.getByRole("form", { name: "Reply controls" });
  const composer = dock.getByRole("textbox", { name: "Your reply", exact: true });
  await expect(transcript).toContainText("What can I get for you today?");
  await expect(dock).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
  await composer.fill("Could I have a latte and a muffin, please?");
  await button("Keyboard").click();
  await expect(composer).toBeHidden();
  await button("Keyboard").click();
  await expect(composer).toHaveValue("Could I have a latte and a muffin, please?");
  await button("Send reply").click();
  await expect(transcript).toContainText("What size would you like?");
  await expect(dock).toBeInViewport({ ratio: 1 });
  await button("Exit lesson").click();
  await expect(page.getByRole("heading", { name: "Conversation", exact: true })).toBeVisible();
  await openWorkspacePage(page, "Training");
  await expect(transcript).toContainText("What size would you like?");
  await expect(
    transcript.getByText("Could I have a latte and a muffin, please?", { exact: true }),
  ).toHaveCount(1);
});
