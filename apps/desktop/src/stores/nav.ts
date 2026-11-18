import { create } from "zustand";

export const workspaces = [
  { id: "home", pages: ["plan", "scenarios"] },
  { id: "conversation", pages: ["conversation", "training", "listening"] },
  { id: "review", pages: ["review", "vocabulary", "sentences", "corrections", "reports"] },
  { id: "profile", pages: ["profile", "memory", "settings"] },
] as const;

export type PageId = (typeof workspaces)[number]["pages"][number];
export type WorkspaceId = (typeof workspaces)[number]["id"];

interface NavState {
  page: PageId;
  navigate: (page: PageId) => void;
}

export const useNavStore = create<NavState>((set) => ({
  page: "plan",
  navigate: (page) => set({ page }),
}));
