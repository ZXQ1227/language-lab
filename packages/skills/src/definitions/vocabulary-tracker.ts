// VocabularyTracker - tracks which target vocabulary the student produced.
// Rule-based matching (deterministic); mastery updates happen in the memory
// layer, not here - this skill only reports observations.

import { z } from "zod";
import type { SkillDefinition } from "../contract";
import type { SkillContext } from "../context";

const inputSchema = z.object({
  utterance: z.string().min(1),
  targetVocabulary: z.array(z.string()),
});

const outputSchema = z.object({
  used: z.array(z.string()),
  missed: z.array(z.string()),
});

export type VocabularyTrackerInput = z.infer<typeof inputSchema>;
export type VocabularyTrackerOutput = z.infer<typeof outputSchema>;

/** Word-boundary, case-insensitive containment check. */
function containsPhrase(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

export function createVocabularyTrackerSkill(): SkillDefinition<
  VocabularyTrackerInput,
  VocabularyTrackerOutput
> {
  return {
    id: "skills.vocabulary_tracker",
    version: "0.1.0",
    description: "Detects target vocabulary usage in the student utterance (rule-based).",
    inputSchema,
    outputSchema,
    async execute(input, _context: SkillContext) {
      const used = input.targetVocabulary.filter((v) => containsPhrase(input.utterance, v));
      const missed = input.targetVocabulary.filter((v) => !used.includes(v));
      return { used, missed };
    },
  };
}

/** Mock: same rules - kept separate so tests can swap it without behavior change. */
export function createMockVocabularyTrackerSkill(): SkillDefinition<
  VocabularyTrackerInput,
  VocabularyTrackerOutput
> {
  return { ...createVocabularyTrackerSkill() };
}
