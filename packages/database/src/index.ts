// @language-lab/database
// Persistence layer boundary.
//
// Blueprint v1.1 decision:
// - SQLite lives in the Rust core (rusqlite), reached over Tauri IPC
//   (tauri-plugin-sql or custom commands).
// - Drizzle is a build-time tool only: schema authoring + SQL migration
//   generation. The generated .sql files are executed by Rust at startup.
// - All queries are parameterized. No string-concatenated SQL.
//
// The client implementation (IPC driver) and drizzle schema arrive with the
// first data model task. Planned tables:
//   users, student_profiles, lessons, scenarios, conversations, messages,
//   learning_events, knowledge_items, student_knowledge, error_records,
//   review_tasks, memory_snapshots

export interface DbClient {
  /** Placeholder until the IPC client exists. */
  readonly backend: "rust-sqlite";
}
