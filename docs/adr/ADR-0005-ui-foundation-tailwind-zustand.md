# ADR-0005: UI foundation — Tailwind CSS v4 + Zustand, no router dependency

- Status: Accepted
- Date: 2026-11-17
- Deciders: project lead + AI engineering agent

## Context

The desktop shell needs styling and app state. A router dependency adds
surface area a desktop shell does not need yet (no deep links, no web URLs).

## Decision

- **Tailwind CSS v4** via the `@tailwindcss/vite` plugin (no PostCSS config,
  no tailwind.config.js in the default path). Verified against Vite 6 and the
  Tauri `es2022` build target.
- **Zustand** for app state: `nav` (active page) and `system` (IPC health +
  db status). Navigation is a sidebar store switch, not a router.
- All IPC goes through `src/lib/ipc.ts`, which normalizes failures into a
  single `IpcError` shape for consistent loading/error states.

## Consequences

- Pages are plain components; a real router can be introduced later without
  rewriting state logic.
- Every page must handle three states (loading / error / data) from the start;
  e2e asserts the error path with a retry button.
- v0.1 ships a fixed light theme; dark mode is deferred.
