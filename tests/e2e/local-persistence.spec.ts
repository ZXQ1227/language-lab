// Local data persistence contract, exercised at the UI boundary.
//
// The real persistence path (rusqlite + backups) is covered by Rust unit
// tests and the Task 04 acceptance run. Here we verify the webview side of
// the contract: data written through IPC survives a page reload (the
// local-first "restart the app" scenario), and reads round-trip cleanly.

import { expect, test } from "@playwright/test";
import { installTauriMock } from "./helpers/tauri-mock";

test.describe("local data persistence", () => {
  test("records written through IPC survive an app restart (reload)", async ({ page }) => {
    await installTauriMock(page, {
      lessons: [],
    });
    await page.goto("/");
    await expect(page.getByText("Language Lab", { exact: true })).toBeVisible();

    // Write one lesson row through the (mocked) persistence layer.
    const written = await page.evaluate(async () => {
      await window.__llInvoke("db_execute", {
        sql: "INSERT INTO lessons (id, user_id, scenario_id, status) VALUES (?1, ?2, ?3, ?4)",
        params: ["lesson-e2e-1", "e2e-user", "scenario-cafe", "active"],
      });
      return (await window.__llInvoke("db_select", {
        sql: "SELECT * FROM lessons",
      })) as { id: string; scenario_id: string; status: string }[];
    });
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ id: "lesson-e2e-1", status: "active" });

    // Reload = app restart. The record must still be there.
    await page.reload();
    const afterRestart = await page.evaluate(async () => {
      return (await window.__llInvoke("db_select", {
        sql: "SELECT * FROM lessons",
      })) as { id: string }[];
    });
    expect(afterRestart.map((r) => r.id)).toEqual(["lesson-e2e-1"]);

    // And the shell is healthy after the restart.
    await expect(page.getByText("Language Lab", { exact: true })).toBeVisible();
  });

  test("fresh sessions start with an empty store (no leakage between users)", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await installTauriMock(page, { lessons: [] });
    await page.goto("/");

    const rows = await page.evaluate(async () => {
      return (await window.__llInvoke("db_select", {
        sql: "SELECT * FROM lessons",
      })) as unknown[];
    });
    expect(rows).toEqual([]);
    await context.close();
  });
});
