# ADR-0002: API keys live in the OS keyring; AI calls proxy through Rust

- Status: Accepted
- Date: 2026-11-17
- Deciders: project lead + AI engineering agent

## Context

Model Gateway (LLM / ASR / TTS) needs provider API keys. Storing keys in the
webview (localStorage, IndexedDB, plain files) exposes them to any injected
script and contradicts the local-first security posture.

## Decision

- Provider keys are stored via the **OS keyring** (macOS Keychain /
  Windows Credential Manager) through Rust commands (`secrets_*` in
  `src-tauri/secrets.rs`), with a strict name allowlist and no enumeration
  API.
- The webview reads keys only through the KeyStore abstraction
  (`packages/model-gateway/keys.ts`); keys never enter webview storage.
- Outbound model calls go through a Rust proxy by default (blueprint v1.1);
  until that lands, the webview may call providers directly but keys are
  still injected from the keyring at call time, never persisted.

## Consequences

- Tests run against MockProvider or injected fake fetch functions; no real
  keys in CI or unit tests.
- Keychain round-trip cannot be exercised by unsigned dev binaries on macOS
  (sandbox denies it) — the round-trip test is `#[ignore]` until a signed
  build exists.
