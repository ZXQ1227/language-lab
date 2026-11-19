# ADR-0001: The webview has no Node.js — SQLite lives in the Rust core

- Status: Accepted
- Date: 2026-11-17
- Deciders: project lead + AI engineering agent

## Context

Sayden is a Tauri 2 app. Tauri's webview (WKWebView / WebView2) has no
Node.js runtime. The original blueprint v1.0 placed Drizzle + a SQLite driver
in a TypeScript `packages/database` runtime layer, which cannot work.

## Decision

- SQLite runs in the Rust process via **rusqlite** (bundled), reached from the
  webview only over Tauri IPC commands (`db_select`, `db_execute`,
  `db_status`, `db_backup`, `db_restore`).
- Drizzle is a **build-time tool only**: the Drizzle schema authors SQL
  migrations that are embedded in the Rust core and applied transactionally
  (tracked in `_ll_migrations`, with automatic pre-migration backups).
- TypeScript repositories (`packages/database`) are the only place SQL strings
  exist outside Rust; they validate every row with Zod before it escapes.

## Consequences

- No Node native modules in the frontend, ever.
- All persistence is testable two ways: Rust unit tests and TypeScript
  repository tests against an in-memory transport fake.
- IPC adds a small serialization cost per query; acceptable for local-first
  single-user workloads.
