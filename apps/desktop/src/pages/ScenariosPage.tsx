import { LocalizedError } from "../components/LocalizedError";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { createRepositories, createTauriTransport } from "@language-lab/database";
import { invoke } from "@tauri-apps/api/core";
import type { ScenarioRow } from "@language-lab/database";
import { scenarioContentSchema, type ScenarioContent } from "@language-lab/core";
import { loadScenarioContent, starterCoursePaths } from "../content/scenarioContent";
import { matchesLibraryDifficulty } from "../content/courseDifficulty";
import { CourseTemplateEditor } from "../components/CourseTemplateEditor";
import { CourseDialog, CoursePathRow } from "../components/StarterCourseLibrary";
import { useNavStore } from "../stores/nav";
import { useTrainingStore } from "../stores/training";

const bundledSlugs = new Set(loadScenarioContent().map((course) => course.slug));

function CourseCard({
  item,
  course,
  onPractise,
  busy,
}: {
  item: Pick<ScenarioContent, "title" | "category" | "objectives" | "targetVocabulary"> & {
    difficulty: string;
  };
  course?: ScenarioContent;
  onPractise?: (course: ScenarioContent) => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <article
      className={course ? undefined : "rounded-lg border border-line bg-surface p-5 shadow-sm"}
    >
      {!course && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="text-base font-semibold text-ink">{item.title}</h3>
          <span className="shrink-0 rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs font-medium text-ink-muted">
            {t(`common:categories.${item.category}`, { defaultValue: item.category })} ·{" "}
            {item.difficulty}
          </span>
        </div>
      )}
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        {t("scenarios:objectives")}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-muted">
        {item.objectives.map((objective) => (
          <li key={objective}>{objective}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-ink-muted">
        {t("scenarios:targetVocabulary")}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {item.targetVocabulary.map((word) => (
          <span
            key={word}
            className="rounded bg-brand-primary-soft px-2 py-0.5 text-xs font-medium text-brand-ink ring-1 ring-line-info"
          >
            {word}
          </span>
        ))}
      </div>
      {course && onPractise && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onPractise(course)}
          className="mt-4 rounded-lg button-primary px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {t("common:workspace.beginCourse")}
        </button>
      )}
      {course && <CourseTemplateEditor scenario={course} />}
    </article>
  );
}

export function ScenariosPage() {
  const { t } = useTranslation();
  const navigate = useNavStore((state) => state.navigate);
  const difficulty = useNavStore((state) => state.libraryDifficulty);
  const setDifficulty = useNavStore((state) => state.setLibraryDifficulty);
  const prepare = useTrainingStore((state) => state.prepare);
  const busy = useTrainingStore((state) => state.busy);
  const [scenarios, setScenarios] = useState<ScenarioRow[] | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<ScenarioContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [imported, setImported] = useState<{ scenario: ScenarioContent; revision: number }[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const matches = (item: { difficulty: string }) =>
    matchesLibraryDifficulty(item.difficulty, difficulty);
  const paths = starterCoursePaths
    .map(({ id, entries }) => ({
      id,
      entries: entries.filter(({ course }) => matches(course)),
    }))
    .filter(({ entries }) => entries.length > 0);
  const visibleImports = imported.filter(({ scenario }) => matches(scenario));
  const localScenarios = scenarios?.filter(matches) ?? [];

  useEffect(() => {
    let active = true;
    setError(null);
    const db = createTauriTransport(invoke);
    createRepositories(db)
      .scenarios.list()
      .then((rows) => {
        if (active) setScenarios(rows.filter((row) => !bundledSlugs.has(row.slug)));
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
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {t("scenarios:scenarios")}
          </h1>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate("training")}
              className="button-primary rounded-lg px-3 py-2 text-sm font-semibold"
            >
              {t("common:workspace.roleplay")}
            </button>
            <label className="button-secondary inline-block cursor-pointer rounded-lg px-3 py-2 text-sm font-medium focus-within:ring-2 focus-within:ring-brand-primary hover:bg-line">
              {t("scenarios:importCourseTemplate")}
              <input
                className="sr-only"
                type="file"
                accept=".json,application/json"
                aria-describedby="course-import-note"
                disabled={importing}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void importCourse(file);
                }}
              />
            </label>
          </div>
        </div>
        <p id="course-import-note" className="sr-only">
          {t("scenarios:importedTemplatesAreAvailableForThisVisitExportAJSON")}
        </p>
        {importing && (
          <p role="status" className="text-sm text-ink-muted">
            {t("scenarios:validatingCourseTemplate")}
          </p>
        )}
        {importError && (
          <p role="alert" className="text-sm text-error-ink">
            {t("scenarios:couldNotImportTemplate")}
            <LocalizedError error={importError} />
          </p>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-error-line bg-chat-error p-4 text-sm text-error-ink"
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
        <p className="text-sm text-ink-muted">{t("scenarios:loadingScenarioLibrary")}</p>
      )}

      {imported.length > 0 && (
        <section aria-labelledby="imported-course-templates" className="space-y-3">
          <h2 id="imported-course-templates" className="font-semibold text-ink">
            {t("scenarios:importedTemplates")}
          </h2>
          <p className="text-xs text-ink-muted">
            {t("scenarios:importedTemplatesAreAvailableForThisVisitExportAJSON")}
          </p>
          {visibleImports.length < imported.length && (
            <button
              type="button"
              onClick={() => setDifficulty("all")}
              className="text-sm font-semibold text-brand-ink underline underline-offset-4"
            >
              {t("scenarios:showImportedAtAllLevels")}
            </button>
          )}
          {visibleImports.map(({ scenario, revision }) => (
            <article
              key={`${scenario.slug}:${revision}`}
              className="rounded-lg border border-line-info bg-surface p-5"
            >
              <h3 className="font-semibold text-ink">{scenario.title}</h3>
              <CourseTemplateEditor scenario={scenario} />
              <button
                type="button"
                className="mt-3 text-sm text-ink-muted"
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

      {paths.length === 0 &&
        visibleImports.length === 0 &&
        localScenarios.length === 0 &&
        (scenarios || error) && (
          <p
            role="status"
            className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-muted"
          >
            {t("scenarios:noMatchingLessons")}
          </p>
        )}

      <div
        role="group"
        aria-label={t("scenarios:learningPaths")}
        className="@container space-y-7 empty:hidden"
      >
        {paths.map((path) => (
          <CoursePathRow key={`${path.id}:${difficulty}`} path={path} onOpen={setSelectedCourse} />
        ))}
      </div>

      {selectedCourse && (
        <CourseDialog course={selectedCourse} onClose={() => setSelectedCourse(null)}>
          <CourseCard
            item={selectedCourse}
            course={selectedCourse}
            busy={busy}
            onPractise={(selected) => {
              prepare(selected);
              navigate("training");
            }}
          />
        </CourseDialog>
      )}

      {localScenarios.length > 0 && (
        <section className="space-y-3" aria-labelledby="other-local-scenarios">
          <h2 id="other-local-scenarios" className="font-semibold text-ink">
            {t("scenarios:otherLocalScenarios")}
          </h2>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            {localScenarios.map((scenario) => (
              <CourseCard
                key={scenario.id}
                item={{
                  ...scenario,
                  objectives: JSON.parse(scenario.objectives),
                  targetVocabulary: JSON.parse(scenario.targetVocabulary),
                }}
              />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
