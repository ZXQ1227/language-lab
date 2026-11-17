// In-memory DbTransport fake for unit-testing the repository layer without
// the Rust core or a native SQLite driver in CI.
//
// It implements the small SQL subset the repositories actually use:
//   SELECT * FROM t [WHERE ...] [ORDER BY ...] [LIMIT n]
//   SELECT COALESCE(MAX(seq), -1) + 1 AS next_seq FROM messages WHERE ...
//   INSERT INTO t (...) VALUES (...) [ON CONFLICT(...) DO UPDATE SET ...]
//   UPDATE t SET ... [WHERE ...]
// Rows are stored exactly as the Rust core would return them (snake_case).

import type { DbParam, DbRow, DbTransport, ExecResult } from "@language-lab/database";

/** Splits on top-level commas only (respects parens and quoted strings). */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString: "'" | null = null;
  let current = "";
  for (const ch of input) {
    if (inString) {
      current += ch;
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "'") {
      inString = "'";
      current += ch;
      continue;
    }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Resolves a VALUES token: ?N placeholder, 'literal', number or NULL. */
function resolveValue(token: string, params: DbParam[]): DbParam {
  const trimmed = token.trim();
  if (trimmed.startsWith("?")) {
    const m = trimmed.match(/\?(\d+)/)!;
    return params[Number(m[1]) - 1] ?? null;
  }
  if (trimmed === "NULL") return null;
  if (trimmed.startsWith("'")) return trimmed.slice(1, -1);
  return JSON.parse(trimmed) as DbParam;
}

function compare(op: string, left: unknown, right: unknown): boolean {
  switch (op) {
    case "=":
      return left === right;
    case "<=":
      return Number(left) <= Number(right);
    case ">=":
      return Number(left) >= Number(right);
    case "<":
      return Number(left) < Number(right);
    case ">":
      return Number(left) > Number(right);
    default:
      throw new Error(`in-memory transport: unsupported operator ${op}`);
  }
}

/** Evaluates a WHERE clause of `cond AND cond` against a row. */
function matchesWhere(row: DbRow, where: string, params: DbParam[]): boolean {
  const trimmed = where.trim();
  if (!trimmed) return true;
  return trimmed.split(/\s+AND\s+/i).every((cond) => {
    const m = cond.trim().match(/^(\w+)\s*(=|<=|>=|<|>)\s*(.+)$/);
    if (!m || !m[1] || !m[2] || !m[3]) {
      throw new Error(`in-memory transport: unsupported condition "${cond}"`);
    }
    const col = m[1];
    const op = m[2];
    const raw = m[3];
    return compare(op, row[col], resolveValue(raw, params));
  });
}

interface AssignmentContext {
  params: DbParam[];
  inserted?: DbRow;
}

function applyAssignment(row: DbRow, assignment: string, ctx: AssignmentContext): DbRow {
  const m = assignment.trim().match(/^(\w+)\s*=\s*(.+)$/);
  if (!m || !m[1] || !m[2])
    throw new Error(`in-memory transport: unsupported assignment "${assignment}"`);
  const col = m[1];
  const rhs = m[2];
  const coalesce = rhs.match(/^COALESCE\(\s*(\?\d+)\s*,\s*(\w+)\s*\)$/i);
  if (coalesce && coalesce[1] && coalesce[2]) {
    const value = resolveValue(coalesce[1], ctx.params);
    row[col] = value !== null ? value : row[coalesce[2]];
    return row;
  }
  const excluded = rhs.match(/^excluded\.(\w+)$/i);
  if (excluded && excluded[1]) {
    if (!ctx.inserted) throw new Error("in-memory transport: excluded outside upsert");
    row[col] = ctx.inserted[excluded[1]];
    return row;
  }
  row[col] = resolveValue(rhs, ctx.params);
  return row;
}

/** Column lists from packages/database/src/schema.ts (must stay in sync).
 *  Reads emulate SQLite: any column not set on a row reads back as NULL. */
const TABLE_COLUMNS: Record<string, string[]> = {
  users: ["id", "display_name", "created_at", "updated_at"],
  student_profiles: [
    "id",
    "user_id",
    "target_language",
    "level",
    "goals",
    "created_at",
    "updated_at",
  ],
  scenarios: [
    "id",
    "slug",
    "title",
    "category",
    "difficulty",
    "objectives",
    "target_vocabulary",
    "created_at",
    "updated_at",
  ],
  lessons: [
    "id",
    "user_id",
    "scenario_id",
    "status",
    "difficulty_override",
    "started_at",
    "completed_at",
    "created_at",
    "updated_at",
  ],
  conversations: ["id", "lesson_id", "mode", "created_at", "updated_at"],
  messages: [
    "id",
    "conversation_id",
    "seq",
    "role",
    "content",
    "confidence",
    "created_at",
    "updated_at",
  ],
  learning_events: [
    "id",
    "user_id",
    "lesson_id",
    "type",
    "payload",
    "occurred_at",
    "created_at",
    "updated_at",
  ],
  knowledge_items: ["id", "kind", "text", "language", "created_at", "updated_at"],
  student_knowledge: [
    "id",
    "user_id",
    "knowledge_item_id",
    "status",
    "mastery",
    "created_at",
    "updated_at",
  ],
  error_records: [
    "id",
    "user_id",
    "lesson_id",
    "category",
    "original_text",
    "corrected_text",
    "explanation",
    "count",
    "created_at",
    "updated_at",
  ],
  review_tasks: [
    "id",
    "user_id",
    "type",
    "payload",
    "due_at",
    "status",
    "completed_at",
    "created_at",
    "updated_at",
  ],
};

export class InMemoryTransport implements DbTransport {
  readonly tables = new Map<string, Table>();

  private table(name: string): Table {
    let t = this.tables.get(name);
    if (!t) {
      t = [];
      this.tables.set(name, t);
    }
    return t;
  }

  /** Emulates SQLite: absent columns read back as NULL. */
  private materialize(table: string, row: DbRow): DbRow {
    const cols = TABLE_COLUMNS[table];
    if (!cols) return { ...row };
    const out: DbRow = {};
    for (const col of cols) {
      out[col] = row[col] === undefined ? null : row[col];
    }
    return out;
  }

  select(sql: string, params: DbParam[] = []): Promise<DbRow[]> {
    // Aggregate used by MessagesRepo.append for the next sequence number.
    const seqMatch = sql.match(
      /SELECT\s+COALESCE\(MAX\(seq\),\s*-1\)\s*\+\s*1\s+AS\s+(\w+)\s+FROM\s+(\w+)\s*(?:WHERE\s+(.*))?$/is,
    );
    if (seqMatch) {
      const [, alias, table, where] = seqMatch;
      const rows = this.table(table!).filter((r) => matchesWhere(r, where ?? "", params));
      const max = rows.reduce((acc, r) => Math.max(acc, Number(r.seq ?? -1)), -1);
      return Promise.resolve([{ [alias!]: max + 1 }]);
    }

    const selectMatch = sql.match(
      /SELECT\s+\*\s+FROM\s+(\w+)\s*(?:WHERE\s+(.*?))?(?:\s*ORDER\s+BY\s+(.*?))?(?:\s*LIMIT\s+(\d+|\?\d+))?\s*;?\s*$/is,
    );
    if (!selectMatch) throw new Error(`in-memory transport: unsupported query "${sql}"`);
    const [, table, where, orderBy, limitRaw] = selectMatch;
    let rows = this.table(table!)
      .map((r) => this.materialize(table!, r))
      .filter((r) => matchesWhere(r, where ?? "", params));

    if (orderBy) {
      const keys = orderBy
        .split(",")
        .map((k) => k.trim().match(/^(\w+)(?:\s+(ASC|DESC))?$/i)!)
        .map((m) => ({ col: m![1]!, dir: (m![2] ?? "asc").toLowerCase() }));
      rows = [...rows].sort((a, b) => {
        for (const { col, dir } of keys) {
          const av = a[col] as number | string;
          const bv = b[col] as number | string;
          if (av === bv) continue;
          const cmp = av < bv ? -1 : 1;
          return dir === "desc" ? -cmp : cmp;
        }
        return 0;
      });
    }
    if (limitRaw) {
      const limit = limitRaw.startsWith("?")
        ? Number(resolveValue(limitRaw, params))
        : Number(limitRaw);
      rows = rows.slice(0, limit);
    }
    return Promise.resolve(rows.map((r) => ({ ...r })));
  }

  execute(sql: string, params: DbParam[] = []): Promise<ExecResult> {
    const insertMatch = sql.match(
      /INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]*)\)\s*(?:ON\s+CONFLICT\s*\(([^)]+)\)\s+DO\s+UPDATE\s+SET\s+(.*))?$/is,
    );
    if (insertMatch) {
      const [, table, columns, valuesList, conflictCols, setClause] = insertMatch;
      const cols = columns!.split(",").map((c) => c.trim());
      const values = splitTopLevel(valuesList!).map((token) => resolveValue(token, params));
      if (values.length !== cols.length) {
        throw new Error(
          `in-memory transport: ${cols.length} columns but ${values.length} values in "${sql}"`,
        );
      }
      const inserted = Object.fromEntries(cols.map((c, i) => [c, values[i]]));
      if (!TABLE_COLUMNS[table!]) {
        throw new Error(`in-memory transport: unknown table "${table}"`);
      }

      const rows = this.table(table!);
      if (conflictCols) {
        const keys = conflictCols.split(",").map((c) => c.trim());
        const index = rows.findIndex((r) => keys.every((k) => r[k] === inserted[k]));
        if (index >= 0) {
          for (const assignment of splitTopLevel(setClause!)) {
            rows[index] = applyAssignment(rows[index]!, assignment, { params, inserted });
          }
          return Promise.resolve({
            rowsAffected: 1,
            lastInsertId: String(rows[index]!.id ?? ""),
          });
        }
      }
      rows.push(inserted);
      return Promise.resolve({ rowsAffected: 1, lastInsertId: String(inserted.id ?? "") });
    }

    const updateMatch = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.*?)(?:\s+WHERE\s+(.*))?$/is);
    if (updateMatch) {
      const [, table, setClause, where] = updateMatch;
      const rows = this.table(table!);
      const ctx: AssignmentContext = { params };
      let affected = 0;
      for (let i = 0; i < rows.length; i++) {
        if (matchesWhere(rows[i]!, where ?? "", params)) {
          for (const assignment of splitTopLevel(setClause!)) {
            rows[i] = applyAssignment(rows[i]!, assignment, ctx);
          }
          affected++;
        }
      }
      return Promise.resolve({ rowsAffected: affected, lastInsertId: "" });
    }

    throw new Error(`in-memory transport: unsupported statement "${sql}"`);
  }

  status(): Promise<{ ok: boolean; migrationsApplied: number; tables: number; path: string }> {
    return Promise.resolve({
      ok: true,
      migrationsApplied: 1,
      tables: this.tables.size,
      path: ":memory:",
    });
  }

  backup(): Promise<{ path: string }> {
    return Promise.resolve({ path: ":memory:-backup" });
  }

  restore(_sourcePath: string): Promise<void> {
    return Promise.resolve();
  }
}

type Table = DbRow[];
