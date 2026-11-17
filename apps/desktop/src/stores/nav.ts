// Navigation store: which page is active. Kept in Zustand instead of a
// router dependency - a desktop shell has no deep-linking requirements yet.

import { create } from "zustand";

export type PageId = "dashboard" | "scenarios" | "training" | "reports" | "settings";

interface NavState {
  page: PageId;
  navigate: (page: PageId) => void;
}

export const useNavStore = create<NavState>((set) => ({
  page: "dashboard",
  navigate: (page) => set({ page }),
}));
