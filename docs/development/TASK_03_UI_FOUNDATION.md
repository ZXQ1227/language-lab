# Task 03: Desktop interface foundation and localization

Updated: 2026-11-18.

The shell uses existing React/TypeScript/Zustand/Tauri boundaries. This task adds
system-language initialization and persistent manual override across every current
page. See [ADR-0018](../adr/ADR-0018-system-locale-interface-language.md) for dependency,
storage and platform decisions.

## User behavior

1. Launch normally: simplified Chinese OS → simplified Chinese; traditional Chinese
   OS → traditional Chinese; English or unsupported OS → English. No language picker.
2. Open Settings → Language. Follow system is checked by default; the system tag,
   current interface language and regional locale are shown.
3. Uncheck Follow system and choose simplified Chinese, traditional Chinese or
   English. Changes apply immediately after a successful local save. Restarting
   or changing OS language preserves this manual choice.
4. Check Follow system again to read and apply the current OS preference. Later
   changes are detected on focus/visibility/language events and every 30 seconds
   while visible. A save failure keeps the previous mode/language and offers retry.
5. A preferences-read failure blocks changing settings so an unknown saved choice
   cannot be overwritten. The app still opens with available locale plus a notice.

## Development acceptance criteria

- All static UI text, a11y labels, statuses and application validation copy use
  `src/i18n/locales/{zh-CN,zh-TW,en-US}/*.json` resources. Never defer localization
  until after a page is built. Complete all three catalogs with matching variables.
- Priority is manual setting > OS language > English; system snapshots are not
  persisted as user choices. Use standard BCP 47 tags.
- Use `formatDateTime` and `formatNumber` from `src/i18n` for UI values; these combine
  interface language with the system region. Form values and protocol IDs stay raw.
- UI language, learning language, dialogue language and explanation policy remain
  independent. Do not translate or rewrite course data, model replies, quotes,
  profile targets or learning records when the interface changes.
- Settings changes go through the repository/IPC path and must preserve current
  state on failure. Test reload, restoring system, stale native replies and timeout.
- Run typecheck, lint, unit tests, frontend build, Playwright and the native harness:
  `cargo test --locked --manifest-path tests/native-locale/Cargo.toml`.
- Native manual acceptance on macOS and Windows: change preferred UI language and
  regional format independently, return to the app, restart it in manual mode and
  restore system mode. Confirm live training draft/transcript and ASR/TTS language
  stay unchanged. Browser IPC mocks do not replace this check.

## Scope and integration

This branch depends on the unmerged ASR/TTS teaching feature chain and incorporates
`chore/development-governance`. Review/merge those dependencies before this UI task;
this branch does not itself merge them into `main` or publish a release.

## Verification on this branch (2026-11-18)

- Frozen-lockfile install, `pnpm typecheck`, `pnpm lint`, desktop frontend build
  and `pnpm format:check`: passed.
- `pnpm test`: 299 tests passed, including real isolated SQLite preference writes
  and failure rollback; no learner database was opened.
- `pnpm test:e2e --workers=2`: 58 passed using the mocked IPC bridge. Existing
  dashboard recovery coverage now scopes its Retry button to the system alert,
  because language setup adds a separate recovery button. No assertion was removed.
- Native harness: 2 tests passed on Linux. `cargo check --locked --manifest-path
tests/native-locale/Cargo.toml --target x86_64-pc-windows-gnu` and the equivalent
  `aarch64-apple-darwin` check passed. These are compile checks, not execution on
  macOS/Windows. CI adds actual harness execution on all three OS runners.
- Simplified/traditional Chinese Settings pages inspected in Playwright with an
  English browser locale; native IPC preference controlled the interface correctly.
- Full Tauri execution was unavailable here: GTK/WebKitGTK development packages
  are absent. Real macOS/Windows system-language switching and native webview
  behavior remain manual acceptance checks above. Real speech providers were not
  exercised by this interface task.
