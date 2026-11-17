// @language-lab/database
// Persistence layer.
//
// Blueprint v1.1 decision:
// - SQLite lives in the Rust core (rusqlite). The webview has no Node.js
//   runtime, so all statements travel over Tauri IPC (see transport.ts).
// - Drizzle is a build-time tool only: src/schema.ts is authored with Drizzle
//   and `pnpm --filter @language-lab/database db:generate` produces the
//   versioned SQL migrations embedded in the Rust core
//   (apps/desktop/src-tauri/migrations/).
// - Business code never writes SQL: it uses createRepositories().

export * from "./transport";
export * from "./schemas";
export * from "./repositories";
export * from "./schema";
