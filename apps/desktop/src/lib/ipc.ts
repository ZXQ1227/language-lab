// Typed Tauri IPC wrapper.
//
// Every frontend call to the Rust core goes through `call`, so errors have
// one normalized shape (IpcError) and commands are checked in one place.

import { invoke } from "@tauri-apps/api/core";

export class IpcError extends Error {
  constructor(
    readonly command: string,
    readonly cause: unknown,
  ) {
    super(`IPC command "${command}" failed: ${String(cause)}`);
    this.name = "IpcError";
  }
}

export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (cause) {
    throw new IpcError(command, cause);
  }
}

export interface HealthReport {
  status: string;
  appVersion: string;
  os: string;
  arch: string;
}

export interface DbStatus {
  ok: boolean;
  migrationsApplied: number;
  tables: number;
  path: string;
}
