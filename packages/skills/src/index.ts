// @language-lab/skills
// Skill contract, registry and the first batch of teaching skills.
//
// Each definition exports a real (LLM-backed) and a mock (deterministic)
// factory with identical interfaces, so tests and offline development can
// swap implementations without touching the orchestrator.

export * from "./context";
export * from "./contract";
export * from "./registry";
export * from "./definitions/scenario-selector";
export * from "./definitions/dialogue-roleplay";
export * from "./definitions/vocabulary-tracker";
export * from "./definitions/error-diagnosis";
export * from "./definitions/teaching-intervention";
export * from "./definitions/lesson-evaluator";
export * from "./definitions/review-generator";

import { SkillRegistry } from "./registry";
import {
  createScenarioSelectorSkill,
  createMockScenarioSelectorSkill,
} from "./definitions/scenario-selector";
import {
  createDialogueRoleplaySkill,
  createMockDialogueRoleplaySkill,
} from "./definitions/dialogue-roleplay";
import {
  createVocabularyTrackerSkill,
  createMockVocabularyTrackerSkill,
} from "./definitions/vocabulary-tracker";
import {
  createErrorDiagnosisSkill,
  createMockErrorDiagnosisSkill,
} from "./definitions/error-diagnosis";
import {
  createTeachingInterventionSkill,
  createMockTeachingInterventionSkill,
} from "./definitions/teaching-intervention";
import {
  createLessonEvaluatorSkill,
  createMockLessonEvaluatorSkill,
} from "./definitions/lesson-evaluator";
import {
  createReviewGeneratorSkill,
  createMockReviewGeneratorSkill,
} from "./definitions/review-generator";

export const FIRST_BATCH_SKILL_IDS = [
  "skills.scenario_selector",
  "skills.dialogue_roleplay",
  "skills.vocabulary_tracker",
  "skills.error_diagnosis",
  "skills.teaching_intervention",
  "skills.lesson_evaluator",
  "skills.review_generator",
] as const;

/** Registry preloaded with the real (LLM-backed) first batch. */
export function createDefaultSkillRegistry(): SkillRegistry {
  const registry = new SkillRegistry();
  registry.register(createScenarioSelectorSkill());
  registry.register(createDialogueRoleplaySkill());
  registry.register(createVocabularyTrackerSkill());
  registry.register(createErrorDiagnosisSkill());
  registry.register(createTeachingInterventionSkill());
  registry.register(createLessonEvaluatorSkill());
  registry.register(createReviewGeneratorSkill());
  return registry;
}

/** Registry preloaded with deterministic mock skills (no model calls). */
export function createMockSkillRegistry(): SkillRegistry {
  const registry = new SkillRegistry();
  registry.register(createMockScenarioSelectorSkill());
  registry.register(createMockDialogueRoleplaySkill());
  registry.register(createMockVocabularyTrackerSkill());
  registry.register(createMockErrorDiagnosisSkill());
  registry.register(createMockTeachingInterventionSkill());
  registry.register(createMockLessonEvaluatorSkill());
  registry.register(createMockReviewGeneratorSkill());
  return registry;
}
