import { formatNumber } from "../i18n";
import { LocalizedError } from "./LocalizedError";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useTrainingStore } from "../stores/training";
import { useNavStore } from "../stores/nav";
import { CourseStudyPack } from "./CourseStudyPack";
import {
  cefrLevelSchema,
  configureScenarioContent,
  createLessonStateFromScenario,
  type ScenarioContent,
} from "@language-lab/core";

export function CourseTemplateEditor({ scenario }: { scenario: ScenarioContent }) {
  const { t } = useTranslation();
  const trainingBusy = useTrainingStore((state) => state.busy);
  const template = scenario.courseTemplate;
  const [difficulty, setDifficulty] = useState(scenario.difficulty);
  const [variationId, setVariationId] = useState(template?.selectedVariationId ?? "standard");
  const [correctionMode, setCorrectionMode] = useState(
    template?.teachingPolicy.correctionMode ?? "gentle",
  );
  const [maxCorrections, setMaxCorrections] = useState(
    String(template?.teachingPolicy.maxCorrections ?? 3),
  );
  const [maxHints, setMaxHints] = useState(String(template?.teachingPolicy.maxHints ?? 3));
  const [correctionCooldown, setCorrectionCooldown] = useState(
    String(template?.teachingPolicy.correctionCooldownTurns ?? 1),
  );
  const [repeatCooldown, setRepeatCooldown] = useState(
    String(template?.teachingPolicy.repeatCorrectionCooldownTurns ?? 4),
  );
  const [exportError, setExportError] = useState<string | null>(null);
  if (!template) return null;

  let configured: ScenarioContent | null = null;
  let validationError: string | null = null;
  try {
    configured = configureScenarioContent(scenario, {
      difficulty,
      ...(template.learningPack ? { variationId } : {}),
      teachingPolicy: {
        correctionMode,
        maxCorrections: maxCorrections.trim() === "" ? NaN : Number(maxCorrections),
        maxHints: maxHints.trim() === "" ? NaN : Number(maxHints),
        correctionCooldownTurns:
          correctionCooldown.trim() === "" ? NaN : Number(correctionCooldown),
        repeatCorrectionCooldownTurns: repeatCooldown.trim() === "" ? NaN : Number(repeatCooldown),
      },
    });
  } catch {
    validationError = "common:errors.courseFeedbackRange";
  }
  const preview = configured
    ? createLessonStateFromScenario({ lessonId: "preview", scenario: configured, now: 0 })
    : null;
  const displayTemplate = preview?.courseTemplate ?? template;

  function exportTemplate() {
    if (!configured) return;
    setExportError(null);
    try {
      const blob = new Blob([JSON.stringify(configured, null, 2) + "\n"], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${configured.slug}-course.json`;
      link.click();
      // Let the webview begin the download before releasing its object URL.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : "common:errors.courseExport");
    }
  }

  const controlClass =
    "mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900";
  return (
    <details className="mt-4 border-t border-slate-200 pt-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-800">
        {t("course:configureCourse")}
      </summary>
      <div className="mt-4 space-y-5">
        <p className="text-xs text-slate-500">
          {t("course:configureACopyAndExportItToKeepYourChanges")}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {!!template.learningPack?.variations.length && (
            <label className="text-sm text-slate-600">
              {t("course:courseChallenge")}
              <select
                className={controlClass}
                value={variationId}
                onChange={(event) => setVariationId(event.target.value)}
              >
                <option value="standard">{t("course:standardCheckIn")}</option>
                {template.learningPack.variations.map((variation) => (
                  <option key={variation.id} value={variation.id}>
                    {variation.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm text-slate-600">
            {t("course:practiceLevel")}
            <select
              className={controlClass}
              value={difficulty}
              onChange={(event) => setDifficulty(cefrLevelSchema.parse(event.target.value))}
            >
              {cefrLevelSchema.options.map((level) => (
                <option key={level}>{level}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-600">
            {t("course:correctionStyle")}
            <select
              className={controlClass}
              value={correctionMode}
              onChange={(event) =>
                setCorrectionMode(event.target.value === "off" ? "off" : "gentle")
              }
            >
              <option value="gentle">{t("course:gentleCorrections")}</option>
              <option value="off">{t("course:correctionsOff")}</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">
            {t("course:maximumCorrections")}
            <input
              className={controlClass}
              type="number"
              min={0}
              max={20}
              step={1}
              value={maxCorrections}
              onChange={(event) => setMaxCorrections(event.target.value)}
            />
          </label>
          <label className="text-sm text-slate-600">
            {t("course:maximumHints")}
            <input
              className={controlClass}
              type="number"
              min={0}
              max={20}
              step={1}
              value={maxHints}
              onChange={(event) => setMaxHints(event.target.value)}
            />
          </label>
          <label className="text-sm text-slate-600">
            {t("course:practiceTurnsBetweenCorrections")}
            <input
              className={controlClass}
              type="number"
              min={0}
              max={10}
              step={1}
              value={correctionCooldown}
              onChange={(event) => setCorrectionCooldown(event.target.value)}
            />
          </label>
          <label className="text-sm text-slate-600">
            {t("course:practiceTurnsBeforeRepeatingACorrection")}
            <input
              className={controlClass}
              type="number"
              min={0}
              max={10}
              step={1}
              value={repeatCooldown}
              onChange={(event) => setRepeatCooldown(event.target.value)}
            />
          </label>
        </div>
        {validationError && (
          <p role="alert" className="text-sm text-red-700">
            <LocalizedError error={validationError} />
          </p>
        )}
        {preview && (
          <div
            aria-label={t("course:lessonPreview")}
            className="space-y-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600"
          >
            <h3 className="font-semibold text-slate-900">
              {t("course:lessonPreview2")}
              {preview.difficulty} · {formatNumber(displayTemplate.estimatedMinutes)}{" "}
              {t("course:minutes2")}
            </h3>
            <p>{displayTemplate.setting}</p>
            <p>
              <strong>{t("course:yourRole")}</strong> {displayTemplate.roles.learner}
            </p>
            <p>
              <strong>{t("course:practicePartner2")}</strong> {displayTemplate.roles.partner}
            </p>
            {displayTemplate.character && (
              <p>
                <strong>{t("course:character")}</strong> {displayTemplate.character.name} ·{" "}
                {displayTemplate.character.traits.join(", ")}
              </p>
            )}
            <p>
              <strong>{t("course:opening")}</strong> {displayTemplate.openingLine}
            </p>
            <h4 className="font-medium text-slate-900">{t("course:usefulExpressions2")}</h4>
            <ul className="list-disc space-y-1 pl-5">
              {displayTemplate.targetPatterns.map((item) => (
                <li key={item.pattern}>
                  <strong>{item.pattern}</strong> — {item.example}
                </li>
              ))}
            </ul>
            <h4 className="font-medium text-slate-900">{t("course:practiceSteps")}</h4>
            <ol className="list-decimal space-y-3 pl-5">
              {displayTemplate.stages.map((stage) => (
                <li key={stage.id}>
                  <p className="font-medium text-slate-800">{stage.title}</p>
                  <p>{stage.instruction}</p>
                  <p className="mt-1 text-xs font-medium">{t("course:successCriteria")}</p>
                  <ul className="list-disc pl-4">
                    {stage.successCriteria.map((criterion) => (
                      <li key={criterion}>{criterion}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        )}
        {preview?.courseTemplate?.learningPack && (
          <CourseStudyPack template={preview.courseTemplate} />
        )}
        {exportError && (
          <p role="alert" className="text-sm text-red-700">
            <LocalizedError error={exportError} />
          </p>
        )}
        <button
          type="button"
          disabled={!configured}
          onClick={exportTemplate}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {t("course:exportCourseJSON")}
        </button>
        <button
          type="button"
          disabled={!configured || trainingBusy}
          className="ml-3 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-40"
          onClick={() => {
            if (!configured || useTrainingStore.getState().busy) return;
            useTrainingStore.getState().prepare(configured);
            useNavStore.getState().navigate("training");
          }}
        >
          {t("course:practiseThisCourse")}
        </button>
      </div>
    </details>
  );
}
