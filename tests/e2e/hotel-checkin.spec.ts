import { openLibraryLesson, openWorkspacePage } from "./helpers/navigation";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import hotel from "../../content/scenarios/hotel-checkin.json";
import { installTauriMock } from "./helpers/tauri-mock";

test.beforeEach(async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
  await openWorkspacePage(page, "Training");
  await page.getByRole("combobox", { name: "Course", exact: true }).selectOption("hotel-checkin");
  await expect(
    page.getByRole("heading", { name: "Hotel Check-in · A2", exact: true }),
  ).toBeVisible();
});

test("studies the full pack, completes five tasks and restores saved independent review", async ({
  page,
}) => {
  await page.getByText("Lesson reference", { exact: true }).click();
  const pack = page.getByRole("region", { name: "Course study pack" });
  await pack.getByText("Scenario details", { exact: true }).click();
  await expect(
    pack.getByText("Two nights; confirmation number HV-2048", { exact: true }),
  ).toBeVisible();
  await pack.getByText(/Warm-up ·/).click();
  await expect(pack.getByText(/Turn 'I want a quiet room'/)).toBeVisible();
  await pack.getByText(/Vocabulary and meaning/).click();
  await expect(pack.getByText("refundable · 可退还的", { exact: true })).toBeVisible();
  await pack.getByText(/Useful expressions ·/).click();
  await expect(
    pack.getByText(hotel.courseTemplate.targetPatterns[3]!.pattern, { exact: true }),
  ).toBeVisible();
  await pack.getByText("Model conversation · standard scenario", { exact: true }).click();
  await expect(pack.getByText(/So the deposit is separate/)).toBeVisible();
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
  const transcript = page.getByLabel("Conversation", { exact: true });
  await expect(transcript.getByText("Maya", { exact: true })).toHaveCount(1);
  const partnerHeader = page.getByRole("group", { name: "Practice partner", exact: true });
  await expect(partnerHeader.getByText("Maya", { exact: true })).toBeVisible();
  await expect(partnerHeader.locator("img")).toHaveCount(0);
  for (const next of [
    "Confirm your stay and room",
    "Clarify the deposit",
    "Ask about hotel services",
    "Confirm the details and close",
    "All lesson objectives demonstrated",
  ]) {
    await page.getByRole("button", { name: "Use suggested reply", exact: true }).click();
    await page.getByRole("button", { name: "Send reply", exact: true }).click();
    await expect(
      page.getByText(
        next === "All lesson objectives demonstrated" ? next : `Current step: ${next}`,
        { exact: true },
      ),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Finish and review", exact: true }).click();
  const review = page.getByRole("region", { name: "Independent review practice" });
  await expect(review).toBeVisible();
  const answer =
    "I have a reservation under Alex Chen for two nights. Could I have a quiet room, please?";
  await review.getByRole("textbox", { name: "Review answer 1", exact: true }).fill(answer);
  await review
    .getByRole("textbox", { name: "Review answer 2", exact: true })
    .fill("My confirmation number is HV-2048. Could you check again, please?");
  await page.evaluate(() => window.__llInvoke("test_fail_next_checkpoint"));
  await review.getByRole("button", { name: "Save review answers", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Injected checkpoint write failure");
  await expect(review.getByRole("textbox", { name: "Review answer 1", exact: true })).toHaveValue(
    answer,
  );
  await review.getByRole("button", { name: "Save review answers", exact: true }).click();
  await expect(review.getByRole("status")).toContainText("saved on this device");
  await page.reload();
  await openWorkspacePage(page, "Training");
  await expect(page.getByRole("textbox", { name: "Review answer 1", exact: true })).toHaveValue(
    answer,
  );
  await expect(page.getByLabel("Lesson review")).toBeVisible();
});

for (const variationId of ["reservation-not-found", "quiet-room-unavailable"]) {
  test(`practises the ${variationId} challenge with its own criteria and restores it`, async ({
    page,
  }) => {
    await page
      .getByRole("combobox", { name: "Course challenge", exact: true })
      .selectOption(variationId);
    await page.getByRole("button", { name: "Start lesson", exact: true }).click();
    if (variationId === "quiet-room-unavailable") {
      await page.getByRole("button", { name: "Use suggested reply", exact: true }).click();
      await page.getByRole("button", { name: "Send reply", exact: true }).click();
      await expect(
        page.getByText("Current step: Confirm your stay and room", { exact: true }),
      ).toBeVisible();
    }
    const baseReply =
      hotel.courseTemplate.learningPack.guidedPractice[
        variationId === "reservation-not-found" ? 0 : 1
      ]!.suggestedReply;
    await page.getByRole("textbox", { name: "Your reply", exact: true }).fill(baseReply);
    await page.getByRole("button", { name: "Send reply", exact: true }).click();
    await expect(page.getByLabel("Learning feedback")).toContainText("suggested reply only");
    const remaining = variationId === "reservation-not-found" ? 5 : 4;
    for (let index = 0; index < remaining; index++) {
      await page.getByRole("button", { name: "Use suggested reply", exact: true }).click();
      await page.getByRole("button", { name: "Send reply", exact: true }).click();
      if (index < remaining - 1)
        await expect(page.getByRole("textbox", { name: "Your reply", exact: true })).toHaveValue(
          "",
        );
      else
        await expect(
          page.getByText("All lesson objectives demonstrated", { exact: true }),
        ).toBeVisible();
    }
    await page.getByRole("button", { name: "Finish and review", exact: true }).click();
    await expect(page.getByLabel("Lesson review")).toBeVisible();
    await page.reload();
    await openWorkspacePage(page, "Training");
    const variation = hotel.courseTemplate.learningPack.variations.find(
      (item) => item.id === variationId,
    )!;
    await expect(
      page.getByText(`Practice challenge: ${variation.title}`, { exact: true }),
    ).toBeVisible();
    const saved = await page.evaluate(() =>
      JSON.parse(
        JSON.parse(sessionStorage.getItem("language-lab-e2e-state")!).trainingCheckpoints[0]
          .payload,
      ),
    );
    expect(saved.state.courseTemplate.selectedVariationId).toBe(variationId);
    expect(saved.state.phase).toBe("done");
    expect(saved.state.courseTemplate.setting.match(/Challenge:/g)).toHaveLength(1);
  });
}

test("exports and reimports a selected Hotel challenge as an editable source template", async ({
  page,
}) => {
  await openWorkspacePage(page, "Scenarios");
  const card = await openLibraryLesson(page, "Hotel Check-in");
  await card.getByText("Configure course", { exact: true }).click();
  await card
    .getByRole("combobox", { name: "Course challenge", exact: true })
    .selectOption("reservation-not-found");
  const downloading = page.waitForEvent("download");
  await card.getByRole("button", { name: "Export course JSON", exact: true }).click();
  const data = await readFile((await (await downloading).path())!);
  const source = JSON.parse(data.toString());
  expect(source.courseTemplate.selectedVariationId).toBe("reservation-not-found");
  expect(source.courseTemplate.stages[0].instruction).toBe(
    hotel.courseTemplate.stages[0]!.instruction,
  );
  await card.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByLabel("Import course template")
    .setInputFiles({ name: "my-hotel.json", mimeType: "application/json", buffer: data });
  const imported = page.getByRole("region", { name: "Imported templates" });
  await imported.getByText("Configure course", { exact: true }).click();
  await expect(
    imported.getByRole("combobox", { name: "Course challenge", exact: true }),
  ).toHaveValue("reservation-not-found");
  await imported.getByRole("button", { name: "Practise this course", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Course challenge", exact: true })).toHaveValue(
    "reservation-not-found",
  );
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
  await expect(page.getByLabel("Conversation")).toContainText("cannot find a booking");
});
