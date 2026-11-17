// Scenarios page: lists the scenario library from the local database.
// Content is synced from content/scenarios at startup (see content/).

import { useEffect, useState } from "react";
import { createRepositories, createTauriTransport } from "@language-lab/database";
import { invoke } from "@tauri-apps/api/core";
import type { ScenarioRow } from "@language-lab/database";
import { scenarioContentSchema, type ScenarioContent } from "@language-lab/core";
import { loadScenarioContent } from "../content/scenarioContent";
import { CourseTemplateEditor } from "../components/CourseTemplateEditor";

const bundled = loadScenarioContent();

export function ScenariosPage() {
  const [scenarios, setScenarios] = useState<ScenarioRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [imported, setImported] = useState<{ scenario: ScenarioContent; revision: number }[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let active = true;
    setError(null);
    const db = createTauriTransport(invoke);
    createRepositories(db)
      .scenarios.list()
      .then((rows) => {
        if (active) setScenarios(rows);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  async function importCourse(file: File) {
    setImporting(true);
    setImportError(null);
    try {
      if (file.size > 1024 * 1024) throw new Error("Choose a template smaller than 1 MB.");
      const raw: unknown = JSON.parse(await file.text());
      const result = scenarioContentSchema.safeParse(raw);
      if (!result.success) {
        throw new Error(
          result.error.issues
            .map((issue) => `${issue.path.join(".") || "template"}: ${issue.message}`)
            .join("; "),
        );
      }
      const course = result.data;
      if (!course.courseTemplate)
        throw new Error("This file needs a courseTemplate with roles and practice stages.");
      setImported((current) => [
        ...current.filter((item) => item.scenario.slug !== course.slug),
        {
          scenario: course,
          revision: (current.find((item) => item.scenario.slug === course.slug)?.revision ?? 0) + 1,
        },
      ]);
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setImporting(false);
    }
  }

  return (
    <section aria-label="Scenarios" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Scenarios</h1>
        <p className="mt-1 text-sm text-slate-500">
          Real-life conversation scenarios with clear objectives and target vocabulary.
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">
          Import course template
          <input
            className="mt-2 block text-sm text-slate-600"
            type="file"
            accept=".json,application/json"
            disabled={importing}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importCourse(file);
            }}
          />
        </label>
        <p className="text-xs text-slate-500">
          Imported templates are available for this visit. Export a JSON copy to keep or share a
          configuration.
        </p>
        {importing && (
          <p role="status" className="text-sm text-slate-500">
            Validating course template…
          </p>
        )}
        {importError && (
          <p role="alert" className="text-sm text-red-700">
            Could not import template: {importError}
          </p>
        )}
      </div>

      {imported.length > 0 && (
        <section aria-label="Imported templates" className="space-y-3">
          <h2 className="font-semibold text-slate-900">Imported templates</h2>
          {imported.map(({ scenario, revision }) => (
            <article
              key={`${scenario.slug}:${revision}`}
              className="rounded-lg border border-emerald-200 bg-white p-5"
            >
              <h3 className="font-semibold text-slate-900">{scenario.title}</h3>
              <CourseTemplateEditor scenario={scenario} />
              <button
                type="button"
                className="mt-3 text-sm text-slate-500"
                onClick={() =>
                  setImported((current) =>
                    current.filter((item) => item.scenario.slug !== scenario.slug),
                  )
                }
              >
                Remove imported template
              </button>
            </article>
          ))}
        </section>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          Could not load scenarios: {error}
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="ml-3 underline"
          >
            Retry
          </button>
        </div>
      )}

      {!error && !scenarios && <p className="text-sm text-slate-500">Loading scenario library…</p>}

      {scenarios && scenarios.length === 0 && (
        <p className="text-sm text-slate-500">No scenarios in the library yet.</p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
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
            {bundled.find((item) => item.slug === scenario.slug) && (
              <CourseTemplateEditor
                scenario={bundled.find((item) => item.slug === scenario.slug)!}
              />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
