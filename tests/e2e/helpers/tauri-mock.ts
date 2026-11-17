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
  profiles?: {
    id: string;
    user_id: string;
    target_language: string;
    level: string;
    goals: string;
    created_at: number;
    updated_at: number;
  }[];
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
    let failNextMemorySave = false;
    let failNextProfileSave = false;
    let failNextMemoryRead = false;
    const secrets = new Map<string, string>();

    const invokeFn = async (cmd: string, args?: Record<string, unknown>) => {
      const s = read();
      switch (cmd) {
        case "test_fail_next_memory":
          failNextMemorySave = true;
          return null;
        case "test_fail_next_profile":
          failNextProfileSave = true;
          return null;
        case "test_fail_next_memory_read":
          failNextMemoryRead = true;
          return null;
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
          if (sql.startsWith("INSERT INTO student_profiles")) {
            if (failNextProfileSave) {
              failNextProfileSave = false;
              throw new Error("Injected profile write failure");
            }
            const profiles = s.profiles ?? [];
            const index = profiles.findIndex((profile) => profile.user_id === String(params[1]));
            const profile = {
              id: String(params[0]),
              user_id: String(params[1]),
              target_language: String(params[2]),
              level: String(params[3]),
              goals: String(params[4]),
              created_at: Number(params[5]),
              updated_at: Number(params[5]),
            };
            if (index < 0) profiles.push(profile);
            else
              profiles[index] = {
                ...profile,
                id: profiles[index]!.id,
                created_at: profiles[index]!.created_at,
              };
            write({ ...s, profiles });
            return { rowsAffected: 1, lastInsertId: profile.id };
          }
          if (sql.startsWith("INSERT INTO learning_events")) {
            if (failNextTrainingSave) {
              failNextTrainingSave = false;
              throw new Error("Injected checkpoint write failure");
            }
            if (failNextMemorySave && params.length === 8) {
              failNextMemorySave = false;
              throw new Error("Injected memory write failure");
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
            if (params.length === 8) {
              const memory = {
                ...row,
                id: String(params[5]),
                type: String(params[6]),
                payload: String(params[7]),
              };
              const memoryIndex = checkpoints.findIndex((item) => item.id === memory.id);
              if (memoryIndex < 0) checkpoints.push(memory);
              else
                checkpoints[memoryIndex] = {
                  ...memory,
                  created_at: checkpoints[memoryIndex]!.created_at,
                };
            }
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
          const params = (args?.params as unknown[]) ?? [];
          if (sql.startsWith("SELECT * FROM student_profiles"))
            return (s.profiles ?? []).filter((profile) =>
              sql.includes("user_id =")
                ? profile.user_id === String(params[0])
                : profile.id === String(params[0]),
            );
          if (sql.startsWith("SELECT source.* FROM learning_events")) {
            const rows = s.trainingCheckpoints ?? [];
            return rows
              .filter(
                (row) =>
                  row.user_id === String(params[1]) &&
                  row.type === String(params[2]) &&
                  row.id > String(params[3]) &&
                  !rows.some(
                    (memory) =>
                      memory.id === `memory-${row.id.slice(9)}` &&
                      memory.user_id === row.user_id &&
                      memory.type === String(params[0]),
                  ),
              )
              .sort((a, b) => a.id.localeCompare(b.id))
              .slice(0, Number(params[4]));
          }
          if (sql.startsWith("SELECT * FROM learning_events")) {
            if (sql.includes("ORDER BY id") && failNextMemoryRead) {
              failNextMemoryRead = false;
              throw new Error("Injected memory read failure");
            }
            const rows = [...(s.trainingCheckpoints ?? [])];
            if (sql.includes("WHERE id ="))
              return rows.filter(
                (row) =>
                  row.id === String(params[0]) &&
                  (params[1] === undefined || row.user_id === String(params[1])) &&
                  (params[2] === undefined || row.type === String(params[2])),
              );
            const filtered = rows.filter(
              (row) => row.user_id === String(params[0]) && row.type === String(params[1]),
            );
            return sql.includes("ORDER BY id")
              ? filtered
                  .filter((row) => row.id > String(params[2]))
                  .sort((a, b) => a.id.localeCompare(b.id))
                  .slice(0, Number(params[3]))
              : filtered.sort((a, b) => b.updated_at - a.updated_at).slice(0, Number(params[2]));
          }
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
