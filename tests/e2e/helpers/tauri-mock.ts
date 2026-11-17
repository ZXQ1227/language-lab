// Shared Tauri IPC mock for e2e tests.
//
// @tauri-apps/api (v2) routes every invoke() through window.__TAURI_INTERNALS__.
// Installing a mock there lets the plain-browser Playwright run exercise the
// full React UI without the Rust shell, without any real API key.

import type { Page } from "@playwright/test";

export interface MockState {
  lessons: { id: string; scenarioId: string; status: string }[];
}

export async function installTauriMock(page: Page, state?: MockState): Promise<void> {
  await page.addInitScript((initial: MockState | undefined) => {
    // Persist across reloads within the browsing session - mirrors the
    // local-first promise (data survives an app restart).
    const KEY = "language-lab-e2e-state";
    if (!window.sessionStorage.getItem(KEY)) {
      window.sessionStorage.setItem(KEY, JSON.stringify(initial ?? { lessons: [] }));
    }
    const read = () => JSON.parse(window.sessionStorage.getItem(KEY)!) as MockState;
    const write = (s: MockState) => window.sessionStorage.setItem(KEY, JSON.stringify(s));

    const invokeFn = async (cmd: string, args?: Record<string, unknown>) => {
      const s = read();
      switch (cmd) {
        case "health_check":
          return { status: "ok", appVersion: "0.0.1-e2e", os: "playwright", arch: "chromium" };
        case "db_status":
          return {
            ok: true,
            migrationsApplied: 1,
            tables: 11,
            path: ":e2e-mock:",
          };
        case "db_execute": {
          const sql = String(args?.sql ?? "");
          const params = (args?.params as unknown[]) ?? [];
          if (sql.startsWith("INSERT INTO lessons")) {
            s.lessons.push({
              id: String(params[0] ?? crypto.randomUUID()),
              scenarioId: String(params[2] ?? ""),
              status: "active",
            });
            write(s);
            return { rowsAffected: 1, lastInsertId: String(params[0] ?? "") };
          }
          return { rowsAffected: 0, lastInsertId: "" };
        }
        case "db_select": {
          const sql = String(args?.sql ?? "");
          if (sql.startsWith("SELECT * FROM lessons")) {
            return s.lessons.map((l) => ({
              id: l.id,
              user_id: "e2e-user",
              scenario_id: l.scenarioId,
              status: l.status,
              difficulty_override: null,
              started_at: 0,
              completed_at: null,
              created_at: 0,
              updated_at: 0,
            }));
          }
          return [];
        }
        default:
          throw new Error(`e2e mock: unhandled command "${cmd}"`);
      }
    };
    window.__TAURI_INTERNALS__ = {
      transformCallback: (cb: unknown) => cb,
      invoke: invokeFn,
    };
    // Test-facing handle so page.evaluate can call commands directly.
    window.__llInvoke = invokeFn;
  }, state);
}

/** Removes the mock entirely so the app hits the real (absent) IPC bridge. */
export async function uninstallTauriMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      get: () => undefined,
    });
  });
}
