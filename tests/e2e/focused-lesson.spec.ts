import { expect, test, type Locator } from "@playwright/test";
import { openWorkspacePage } from "./helpers/navigation";
import { installTauriMock } from "./helpers/tauri-mock";

async function expectReadableColorPair(locator: Locator, background: string) {
  await expect(locator).toHaveCSS("background-color", background);
  const contrast = await locator.evaluate((element) => {
    const { color, backgroundColor } = getComputedStyle(element);
    const luminance = (value: string) => {
      const [red, green, blue] = value.match(/\d+/g)!.map((channel) => {
        const srgb = Number(channel) / 255;
        return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
    };
    const colorLightness = luminance(color);
    const backgroundLightness = luminance(backgroundColor);
    return (
      (Math.max(colorLightness, backgroundLightness) + 0.05) /
      (Math.min(colorLightness, backgroundLightness) + 0.05)
    );
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
}

test("previews the course, keeps reply controls within the window and resumes saved dialogue", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await installTauriMock(page);
  await page.goto("/");
  const home = page.getByRole("button", { name: "Home", exact: true });
  await expectReadableColorPair(home, "rgb(234, 241, 255)");
  await openWorkspacePage(page, "Training");
  const preview = page.getByRole("region", { name: "What you’ll practise" });
  await expect(preview.getByText("latte", { exact: true })).toBeVisible();
  await expect(
    preview
      .getByRole("listitem")
      .filter({ hasText: /Could I have/ })
      .first(),
  ).toBeVisible();
  const start = page.getByRole("button", { name: "Start lesson", exact: true });
  await expect(start).toBeEnabled();
  await expectReadableColorPair(start, "rgb(47, 109, 234)");
  await start.click();
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  const transcript = page.getByLabel("Conversation", { exact: true });
  const dock = page.getByRole("form", { name: "Reply controls" });
  const composer = dock.getByRole("textbox", { name: "Your reply", exact: true });
  await expect(transcript).toContainText("What can I get for you today?");
  await expectReadableColorPair(transcript.getByRole("listitem").first(), "rgb(240, 238, 255)");
  await expect(transcript.getByText("Zoi", { exact: true })).toHaveCount(1);
  const partner = page.getByRole("group", { name: "Practice partner", exact: true });
  await expect(partner.getByText("Zoi", { exact: true })).toBeVisible();
  const avatar = partner.locator("img");
  await expect(avatar).toBeVisible();
  await expect
    .poll(() => avatar.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await expect(dock).toBeInViewport({ ratio: 1 });
  const details = dock.getByText("Lesson details", { exact: true });
  await details.click();
  await expect(dock.getByLabel("Current success criteria", { exact: true })).toBeInViewport();
  await expect(dock.getByRole("button", { name: "Record reply", exact: true })).toBeInViewport();
  await details.click();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
  await composer.fill("Could I have a latte and a muffin, please?");
  await expect(composer).toHaveCSS("outline-color", "rgb(57, 120, 246)");
  await expect(composer).toHaveCSS("outline-style", "solid");
  await button("Keyboard").click();
  await expect(composer).toBeHidden();
  await button("Keyboard").click();
  await expect(composer).toHaveValue("Could I have a latte and a muffin, please?");
  await button("Send reply").click();
  await expect(transcript).toContainText("What size would you like?");
  const firstReply = transcript.getByRole("listitem").filter({ hasText: "Could I have a latte" });
  await expectReadableColorPair(firstReply, "rgb(47, 109, 234)");
  const progress = page.getByRole("progressbar");
  await expect(progress).toHaveCSS("appearance", "none");
  await expect(progress).toHaveCSS("color", "rgb(57, 120, 246)");
  await expectReadableColorPair(page.getByLabel("Learning feedback"), "rgb(234, 247, 240)");
  await expect(dock).toBeInViewport({ ratio: 1 });
  await button("Exit lesson").click();
  await expect(page.getByRole("heading", { name: "Conversation", exact: true })).toBeVisible();
  await openWorkspacePage(page, "Training");
  await expect(transcript).toContainText("What size would you like?");
  await expect(transcript.getByText("Zoi", { exact: true })).toHaveCount(2);
  await expect(
    transcript.getByText("Could I have a latte and a muffin, please?", { exact: true }),
  ).toHaveCount(1);
});
