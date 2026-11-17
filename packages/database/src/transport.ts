// Transport between the repositories and the SQLite engine in the Rust core.
//
// The webview has no Node.js runtime (blueprint v1.1), so all statements go
// over Tauri IPC to rusqlite. The transport interface itself is dependency-
// free so repositories can be unit-tested with an in-memory fake.

export type DbParam = null | number | string | boolean;

export interface DbRow {
  [column: string]: unknown;
}

export interface ExecResult {
  rowsAffected: number;
  lastInsertId: string;
}

export interface DbStatus {
  ok: boolean;
  migrationsApplied: number;
  tables: number;
  path: string;
}

export interface DbTransport {
  select(sql: string, params?: DbParam[]): Promise<DbRow[]>;
  execute(sql: string, params?: DbParam[]): Promise<ExecResult>;
  status(): Promise<DbStatus>;
  backup(): Promise<{ path: string }>;
  restore(sourcePath: string): Promise<void>;
}

/**
 * Production transport: bridges to the Rust commands (db_select, db_execute,
 * db_status, db_backup, db_restore) via Tauri IPC.
 */
export function createTauriTransport(
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>,
): DbTransport {
  return {
    select(sql, params = []) {
      return invoke("db_select", { sql, params }) as Promise<DbRow[]>;
    },
    execute(sql, params = []) {
      return invoke("db_execute", { sql, params }) as Promise<ExecResult>;
    },
    status() {
      return invoke("db_status") as Promise<DbStatus>;
    },
    backup() {
      return invoke("db_backup") as Promise<{ path: string }>;
    },
    restore(sourcePath) {
      return invoke("db_restore", { sourcePath }).then(() => undefined);
    },
  };
}
