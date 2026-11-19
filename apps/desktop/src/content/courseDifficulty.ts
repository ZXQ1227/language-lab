export const libraryDifficulties = ["all", "beginner", "intermediate", "advanced"] as const;
export type LibraryDifficulty = (typeof libraryDifficulties)[number];

const difficultyLevels = {
  beginner: ["A1", "A2"],
  intermediate: ["B1", "B2"],
  advanced: ["C1", "C2"],
} satisfies Record<Exclude<LibraryDifficulty, "all">, string[]>;

export function matchesLibraryDifficulty(level: string, filter: LibraryDifficulty): boolean {
  return filter === "all" || difficultyLevels[filter].includes(level);
}
