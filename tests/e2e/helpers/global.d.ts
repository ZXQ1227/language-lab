// Window globals installed by tests/e2e/helpers/tauri-mock.ts.

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
      transformCallback: (cb: unknown) => unknown;
    };
    __llInvoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  }
}

export {};
