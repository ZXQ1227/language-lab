// API key storage.
//
// Requirement: keys must live in the OS secure credential store, never in
// source code, config files or the webview's localStorage. The production
// store (`createKeyringStore`) delegates to Rust commands backed by
// macOS Keychain / Windows Credential Manager. The in-memory store exists for
// tests and explicit dev convenience only and never touches disk.

export type KeyName = `llm.${string}` | `asr.${string}` | `tts.${string}`;

export interface KeyStore {
  get(name: KeyName): Promise<string | null>;
  set(name: KeyName, value: string): Promise<void>;
  delete(name: KeyName): Promise<void>;
}

/** RAM-only store for unit tests. Values never leave the process. */
export function createMemoryKeyStore(initial?: Record<string, string>): KeyStore {
  const keys = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    async get(name) {
      return keys.get(name) ?? null;
    },
    async set(name, value) {
      keys.set(name, value);
    },
    async delete(name) {
      keys.delete(name);
    },
  };
}

type InvokeFn = (cmd: string, args?: unknown) => Promise<unknown>;

/**
 * Store backed by the Rust core (secrets_get / secrets_set / secrets_delete),
 * which uses the OS keyring. Keys cross the IPC boundary only when a provider
 * is being constructed - they are never rendered or logged in the webview.
 */
export function createKeyringStore(invoke: InvokeFn): KeyStore {
  return {
    async get(name) {
      return (await invoke("secrets_get", { name })) as string | null;
    },
    async set(name, value) {
      await invoke("secrets_set", { name, value });
    },
    async delete(name) {
      await invoke("secrets_delete", { name });
    },
  };
}

/**
 * Resolves a key for a provider: explicit in-memory key wins (tests),
 * otherwise the secure store. Throws when nothing is configured so callers
 * fail fast with a clear setup message instead of sending empty credentials.
 */
export async function resolveApiKey(
  store: KeyStore,
  name: KeyName,
  explicit?: string,
): Promise<string> {
  if (explicit) return explicit;
  const stored = await store.get(name);
  if (stored && stored.length > 0) return stored;
  throw new Error(
    `missing API key "${name}" - configure it in Settings (stored in the OS keyring)`,
  );
}
