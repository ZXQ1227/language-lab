import { create } from "zustand";
import type { LibraryDifficulty } from "../content/courseDifficulty";
import type { VoiceMeaningAmbiguity } from "../conversation/voiceMeaning";

export const homeTabs = ["plan", "scenarios"] as const;
export const libraryTabs = ["scenarios", "guided", "listening"] as const;

export const workspaces = [
  { id: "home", pages: ["plan", ...libraryTabs, "training", "freeConversation"] },
  { id: "review", pages: ["review", "vocabulary", "sentences", "corrections", "reports"] },
  { id: "profile", pages: ["profile", "memory", "settings"] },
] as const;

export type PageId = (typeof workspaces)[number]["pages"][number];
export type WorkspaceId = (typeof workspaces)[number]["id"];

interface NavState {
  page: PageId;
  trainingReturnPage: Exclude<PageId, "training">;
  freeConversationId: string | null;
  freeConversationReturnPage: PageId;
  openFreeConversation: (id: string) => void;
  libraryDifficulty: LibraryDifficulty;
  freeConversationDraft: string;
  freeConversationAmbiguities: VoiceMeaningAmbiguity[];
  courseDesignGoal: string;
  setFreeConversationDraft: (draft: string, ambiguities?: VoiceMeaningAmbiguity[]) => void;
  setCourseDesignGoal: (goal: string) => void;
  setLibraryDifficulty: (libraryDifficulty: LibraryDifficulty) => void;
  navigate: (page: PageId) => void;
}

export const useNavStore = create<NavState>((set) => ({
  page: "plan",
  trainingReturnPage: "plan",
  freeConversationId: null,
  freeConversationReturnPage: "plan",
  openFreeConversation: (id) =>
    set((state) => ({
      page: "freeConversation",
      freeConversationId: id,
      freeConversationReturnPage: state.page,
    })),
  libraryDifficulty: "all",
  freeConversationDraft: "",
  freeConversationAmbiguities: [],
  courseDesignGoal: "",
  setFreeConversationDraft: (freeConversationDraft, freeConversationAmbiguities = []) =>
    set({ freeConversationDraft, freeConversationAmbiguities }),
  setCourseDesignGoal: (courseDesignGoal) => set({ courseDesignGoal }),
  setLibraryDifficulty: (libraryDifficulty) => set({ libraryDifficulty }),
  navigate: (page) =>
    set((state) => {
      if (page === "freeConversation")
        return { page, freeConversationId: null, freeConversationReturnPage: "plan" };
      if (page === "training" && state.page !== "training") {
        return { page, trainingReturnPage: state.page };
      }
      return { page };
    }),
}));
