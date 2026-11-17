// System store: IPC health report + database status.
// One fetch serves Dashboard and Settings; `refresh` retries on demand.

import { create } from "zustand";
import { call, type DbStatus, type HealthReport } from "../lib/ipc";

interface SystemState {
  health: HealthReport | null;
  dbStatus: DbStatus | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export const useSystemStore = create<SystemState>((set) => ({
  health: null,
  dbStatus: null,
  error: null,
  loading: false,
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const [health, dbStatus] = await Promise.all([
        call<HealthReport>("health_check"),
        call<DbStatus>("db_status"),
      ]);
      set({ health, dbStatus, loading: false });
    } catch (cause) {
      set({
        error: cause instanceof Error ? cause.message : String(cause),
        loading: false,
      });
    }
  },
}));
