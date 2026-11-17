// Test-only SQLite engine; the desktop continues using Rust IPC.
import { readFileSync } from "node:fs";
import type { SQLInputValue } from "node:sqlite";
import type { DbParam, DbTransport } from "@language-lab/database";

const native = await import("node:sqlite").catch(() => null);
export const nativeSqliteAvailable = native !== null;
export function createNativeTestDatabase() {
  if (!native) throw new Error("Node's built-in SQLite requires Node 22.13 or later");
  const sql = new native.DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  sql.exec(
    readFileSync(
      new URL("../../../apps/desktop/src-tauri/migrations/0000_square_rictor.sql", import.meta.url),
      "utf8",
    ),
  );
  const bindings = (params: DbParam[]): Record<string, SQLInputValue> =>
    Object.fromEntries(
      params.map((value, index) => [
        `?${index + 1}`,
        typeof value === "boolean" ? Number(value) : value,
      ]),
    );
  const db: DbTransport = {
    async select(statement, params = []) {
      return sql.prepare(statement).all(bindings(params));
    },
    async execute(statement, params = []) {
      const result = sql.prepare(statement).run(bindings(params));
      return { rowsAffected: Number(result.changes), lastInsertId: String(result.lastInsertRowid) };
    },
    async status() {
      return { ok: true, path: ":memory:", tables: 11, migrationsApplied: 1 };
    },
    async backup() {
      throw new Error("Test database backup is not implemented");
    },
    async restore() {
      throw new Error("Test database restore is not implemented");
    },
  };
  return { db, sql, close: () => sql.close() };
}
