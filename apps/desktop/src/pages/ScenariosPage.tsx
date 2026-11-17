// Scenarios page: lists the scenario library from the local database.
// Content is synced from content/scenarios at startup (see content/).

import { useEffect, useState } from "react";
import { createRepositories, createTauriTransport } from "@language-lab/database";
import { invoke } from "@tauri-apps/api/core";
import type { ScenarioRow } from "@language-lab/database";

export function ScenariosPage() {
  const [scenarios, setScenarios] = useState<ScenarioRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const db = createTauriTransport(invoke);
    createRepositories(db)
      .scenarios.list()
      .then(setScenarios)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  return (
    <section aria-label="Scenarios" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Scenarios</h1>
        <p className="mt-1 text-sm text-slate-500">
          Real-life conversation scenarios with clear objectives and target vocabulary.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          Could not load scenarios: {error}
        </div>
      )}

      {!error && !scenarios && <p className="text-sm text-slate-500">Loading scenario library…</p>}

      {scenarios && scenarios.length === 0 && (
        <p className="text-sm text-slate-500">No scenarios in the library yet.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {scenarios?.map((scenario) => (
          <article
            key={scenario.id}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900">{scenario.title}</h2>
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {scenario.category} · {scenario.difficulty}
              </span>
            </div>
            <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">
              Objectives
            </h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
              {JSON.parse(scenario.objectives).map((objective: string) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
            <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">
              Target vocabulary
            </h3>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {JSON.parse(scenario.targetVocabulary).map((word: string) => (
                <span
                  key={word}
                  className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200"
                >
                  {word}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
