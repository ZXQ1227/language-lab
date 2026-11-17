// Syncs bundled scenario content into the local database.
//
// Upsert semantics (ON CONFLICT(slug) DO UPDATE): app updates refresh the
// template rows, while everything else in the database - user data - is
// never touched. Safe to run on every startup.

import { createRepositories, createTauriTransport } from "@language-lab/database";
import { invoke } from "@tauri-apps/api/core";
import { loadScenarioContent } from "./scenarioContent";

export async function syncScenarioContent(): Promise<void> {
  const scenarios = loadScenarioContent();
  const db = createTauriTransport(invoke);
  const repos = createRepositories(db);
  for (const scenario of scenarios) {
    await repos.scenarios.upsert({
      id: scenario.id,
      slug: scenario.slug,
      title: scenario.title,
      category: scenario.category,
      difficulty: scenario.difficulty,
      objectives: [...scenario.objectives],
      targetVocabulary: [...scenario.targetVocabulary],
    });
  }
}
