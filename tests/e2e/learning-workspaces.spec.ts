import { expect, test } from "@playwright/test";
import cafe from "../../content/scenarios/cafe-order.json";
import { installTauriMock } from "./helpers/tauri-mock";

test("moves from the plan into a lesson, resumes it and opens its completed history", async ({
  page,
}) => {
  await installTauriMock(page);
  await page.goto("/");
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  const suggested = page.getByRole("region", { name: "Recommended for you" });
  await expect(suggested.getByRole("heading", { name: "Hotel Check-in" })).toBeVisible();
  await suggested.getByText("View course path", { exact: true }).click();
  await expect(suggested.getByText("Find your reservation", { exact: true })).toBeVisible();
  await button("Try another suggestion").click();
  await expect(suggested.getByRole("heading", { name: "Hotel Check-in" })).toHaveCount(0);
  await expect(suggested.getByRole("heading", { name: "Ordering at a cafe" })).toBeVisible();
  await button("Set up lesson").click();
  await button("Start lesson").click();
  await expect(page.getByRole("heading", { name: /^Ordering at a cafe ·/ })).toBeVisible();
  await button("Home").click();
  await expect(page.getByText("In progress", { exact: true })).toBeVisible();
  await button("Continue lesson").click();
  for (let i = 0; i < 3; i++) {
    await button("Use suggested reply").click();
    await button("Send reply").click();
    if (i < 2)
      await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue("");
  }
  await button("Finish and review").click();
  await expect(page.getByLabel("Lesson review", { exact: true })).toBeVisible();
  await button("Home").click();
  await expect(button("Continue lesson")).toHaveCount(0);
  await page
    .getByRole("region", { name: "Recently completed" })
    .getByRole("button", { name: /^Ordering at a cafe/ })
    .click();
  await expect(page.getByLabel("Lesson reflection")).toBeVisible();
  await expect(page.getByLabel("Report history").getByRole("heading", { level: 2 })).toHaveCount(1);
  const section = page.getByRole("navigation", { name: "Section navigation" });
  await section.getByRole("button", { name: "Vocabulary", exact: true }).click();
  await expect(page.getByRole("region", { name: "Knowledge memory", exact: true })).toBeVisible();
  await section.getByRole("button", { name: "Sentence practice", exact: true }).click();
  await expect(page.getByLabel("Review queue").getByRole("button")).toHaveCount(1);
  await section.getByRole("button", { name: "Corrections", exact: true }).click();
  await expect(page.getByRole("region", { name: "Error memory", exact: true })).toBeVisible();
  await button("My learning").click();
  await expect(page.getByText("Completed lessons", { exact: true }).locator("..")).toHaveText(
    "Completed lessons1",
  );
  await expect(page.getByText("Practice replies", { exact: true }).locator("..")).toHaveText(
    "Practice replies3",
  );
});

test("uses the saved learning language for recommendations", async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Learning preferences", exact: true }).click();
  await page.getByRole("textbox", { name: "Target language code", exact: true }).fill("fr");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByText(/Your stated profile is saved on this device/)).toBeVisible();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByText("The library has no course for fr yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Set up lesson", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Browse courses", exact: true })).toBeVisible();
});

test("listens to the selected course before revealing the transcript or starting practice", async ({
  page,
}) => {
  await installTauriMock(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {
        constructor(readonly text: string) {}
      },
    });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [{ lang: "en-US", localService: true }],
        addEventListener: () => {},
        removeEventListener: () => {},
        speak: (utterance: SpeechSynthesisUtterance) => {
          sessionStorage.setItem("listening-utterance", utterance.text);
        },
        cancel: () => {
          sessionStorage.setItem("listening-cancelled", "true");
        },
      },
    });
  });
  await page.goto("/");
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  await button("Conversation").click();
  await button("Listening & discussion").click();
  await page.getByRole("combobox", { name: "Course", exact: true }).selectOption("cafe-order");
  const opening = page.getByText(cafe.courseTemplate.openingLine, { exact: true });
  await expect(opening).toHaveCount(0);
  await button("Play opening").click();
  await expect(button("Stop playback")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("listening-utterance"))).toBe(
    cafe.courseTemplate.openingLine,
  );
  await button("Show transcript").click();
  await expect(opening).toBeVisible();
  await button("Respond in this course").click();
  await expect(page.getByRole("heading", { name: /^Ordering at a cafe ·/ })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("listening-cancelled"))).toBe("true");
});
