// Shared Tauri IPC mock for e2e tests.
//
// @tauri-apps/api (v2) routes every invoke() through window.__TAURI_INTERNALS__.
// Installing a mock there lets the plain-browser Playwright run exercise the
// full React UI without the Rust shell, without any real API key.

import type { Page } from "@playwright/test";

export interface MockScenarioRow {
  id: string;
  slug: string;
  title: string;
  category: string;
  difficulty: string;
  objectives: string; // JSON string, mirrors the SQL column
  target_vocabulary: string; // JSON string
}

export interface MockState {
  lessons: { id: string; scenarioId: string; status: string }[];
  scenarios: MockScenarioRow[];
  trainingCheckpoints?: {
    id: string;
    user_id: string;
    lesson_id: null;
    type: string;
    payload: string;
    occurred_at: number;
    created_at: number;
    updated_at: number;
  }[];
}

export async function installTauriMock(page: Page, state?: MockState): Promise<void> {
  await page.addInitScript((initial: MockState | undefined) => {
    // NOTE: this function is serialized and injected - it must not close
    // over any module-scope value (learned the hard way: EMPTY_STATE threw
    // "not defined" and silently disabled the whole mock).
    const KEY = "language-lab-e2e-state";
    const fallback = { lessons: [] as never[], scenarios: [] as never[] };
    if (!window.sessionStorage.getItem(KEY)) {
      window.sessionStorage.setItem(KEY, JSON.stringify(initial ?? fallback));
    }
    const read = () => JSON.parse(window.sessionStorage.getItem(KEY)!) as MockState;
    const write = (s: MockState) => window.sessionStorage.setItem(KEY, JSON.stringify(s));
    let failNextTrainingSave = false;
    const secrets = new Map<string, string>();

    const invokeFn = async (cmd: string, args?: Record<string, unknown>) => {
      const s = read();
      switch (cmd) {
        case "test_fail_next_checkpoint":
          failNextTrainingSave = true;
          return null;
        case "secrets_set":
          secrets.set(String(args?.name), String(args?.value));
          return null;
        case "secrets_get":
          return secrets.get(String(args?.name)) ?? null;
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
          if (sql.startsWith("INSERT INTO learning_events")) {
            if (failNextTrainingSave) {
              failNextTrainingSave = false;
              throw new Error("Injected checkpoint write failure");
            }
            const row = {
              id: String(params[0]),
              user_id: String(params[1]),
              lesson_id: null,
              type: String(params[2]),
              payload: String(params[3]),
              occurred_at: Number(params[4]),
              created_at: Number(params[4]),
              updated_at: Number(params[4]),
            };
            const checkpoints = s.trainingCheckpoints ?? [];
            const index = checkpoints.findIndex((item) => item.id === row.id);
            if (index < 0) checkpoints.push(row);
            else checkpoints[index] = { ...row, created_at: checkpoints[index]!.created_at };
            write({ ...s, trainingCheckpoints: checkpoints });
            return { rowsAffected: 1, lastInsertId: row.id };
          }
          if (sql.startsWith("INSERT INTO lessons")) {
            s.lessons.push({
              id: String(params[0] ?? crypto.randomUUID()),
              scenarioId: String(params[2] ?? ""),
              status: "active",
            });
            write(s);
            return { rowsAffected: 1, lastInsertId: String(params[0] ?? "") };
          }
          if (sql.startsWith("INSERT INTO scenarios")) {
            // Upsert by slug: refresh the template row if it exists.
            const row: MockScenarioRow = {
              id: String(params[0]),
              slug: String(params[1]),
              title: String(params[2]),
              category: String(params[3]),
              difficulty: String(params[4]),
              objectives: String(params[5]),
              target_vocabulary: String(params[6]),
            };
            const existing = s.scenarios.findIndex((r) => r.slug === row.slug);
            if (existing >= 0) s.scenarios[existing] = row;
            else s.scenarios.push(row);
            write(s);
            return { rowsAffected: 1, lastInsertId: row.id };
          }
          return { rowsAffected: 0, lastInsertId: "" };
        }
        case "db_select": {
          const sql = String(args?.sql ?? "");
          if (sql.startsWith("SELECT * FROM learning_events"))
            return [...(s.trainingCheckpoints ?? [])].sort((a, b) => b.updated_at - a.updated_at);
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
          if (sql.startsWith("SELECT * FROM scenarios")) {
            return s.scenarios.map((r) => ({ ...r, created_at: 0, updated_at: 0 }));
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
