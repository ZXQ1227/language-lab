import { LocalizedError } from "../components/LocalizedError";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      if (file.size > 1024 * 1024) throw new Error("common:errors.templateSize");
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
      if (!course.courseTemplate) throw new Error("common:errors.templateStructure");
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
    <section aria-label={t("scenarios:scenarios")} className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{t("scenarios:scenarios")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("scenarios:realLifeConversationScenariosWithClearObjectivesAndTargetVocabulary")}
        </p>
      </div>

      <div className="space-y-2">
        <label className="inline-block cursor-pointer rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus-within:ring-2">
          {t("scenarios:importCourseTemplate")}
          <input
            className="sr-only"
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
          {t("scenarios:importedTemplatesAreAvailableForThisVisitExportAJSON")}
        </p>
        {importing && (
          <p role="status" className="text-sm text-slate-500">
            {t("scenarios:validatingCourseTemplate")}
          </p>
        )}
        {importError && (
          <p role="alert" className="text-sm text-red-700">
            {t("scenarios:couldNotImportTemplate")}
            <LocalizedError error={importError} />
          </p>
        )}
      </div>

      {imported.length > 0 && (
        <section aria-label={t("scenarios:importedTemplates")} className="space-y-3">
          <h2 className="font-semibold text-slate-900">{t("scenarios:importedTemplates")}</h2>
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
                {t("scenarios:removeImportedTemplate")}
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
          {t("scenarios:couldNotLoadScenarios")}
          <LocalizedError error={error} />
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="ml-3 underline"
          >
            {t("scenarios:retry")}
          </button>
        </div>
      )}

      {!error && !scenarios && (
        <p className="text-sm text-slate-500">{t("scenarios:loadingScenarioLibrary")}</p>
      )}

      {scenarios && scenarios.length === 0 && (
        <p className="text-sm text-slate-500">{t("scenarios:noScenariosInTheLibraryYet")}</p>
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
                {t(`common:categories.${scenario.category}`, { defaultValue: scenario.category })} ·{" "}
                {scenario.difficulty}
              </span>
            </div>
            <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">
              {t("scenarios:objectives")}
            </h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
              {JSON.parse(scenario.objectives).map((objective: string) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
            <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">
              {t("scenarios:targetVocabulary")}
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
