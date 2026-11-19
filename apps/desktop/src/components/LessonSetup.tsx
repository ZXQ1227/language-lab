import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  configureScenarioContent,
  resolveCourseTemplate,
  type ScenarioContent,
} from "@language-lab/core";
import { CourseStudyPack } from "./CourseStudyPack";
import { formatNumber } from "../i18n";
import { useTrainingStore } from "../stores/training";
import { useAiProviderStore } from "../stores/aiProvider";
import { toTrainingProvider } from "../training/provider";
import { supportsGuidedDemo, type TrainingProvider } from "../training/session";

const control = "mt-1 w-full rounded-lg border form-control px-3 py-2 text-sm";

export function LessonSetup({ course }: { course: ScenarioContent }) {
  const { t } = useTranslation();
  const { start, busy } = useTrainingStore();
  const providerLoading = useAiProviderStore((s) => s.busy);
  const providerSettings = useAiProviderStore((s) => s.settings);
  const loadProvider = useAiProviderStore((s) => s.load);
  const [mode, setMode] = useState<"demo" | "ai">("demo");
  const [variationId, setVariationId] = useState(
    course.courseTemplate?.selectedVariationId ?? "standard",
  );
  useEffect(() => {
    void loadProvider();
  }, [loadProvider]);
  const configured = course.courseTemplate?.learningPack
    ? configureScenarioContent(course, { variationId })
    : course;
  const template = resolveCourseTemplate(configured);
  const selectedMode = supportsGuidedDemo(course) ? mode : "ai";
  return (
    <form
      className="space-y-5 rounded-2xl border border-line bg-surface p-5 sm:p-7"
      onSubmit={(event) => {
        event.preventDefault();
        const provider: TrainingProvider =
          selectedMode === "demo" ? { mode: "demo" } : toTrainingProvider(providerSettings);
        void start(configured, provider);
      }}
    >
      <h2 className="text-2xl font-semibold tracking-tight">
        {course.title} · {course.difficulty}
      </h2>
      <p className="text-sm text-ink-muted">
        {t("training:yourRole")}
        {course.courseTemplate?.roles.learner}
      </p>
      {template?.character && (
        <p className="text-sm text-ink-muted">
          {t("training:practicePartner")}
          {template.character.name} · {template.character.traits.join(", ")}
        </p>
      )}
      {template && (
        <section
          aria-labelledby="lesson-preview-heading"
          className="space-y-4 rounded-xl bg-brand-primary-subtle p-4 sm:p-5"
        >
          <h3 id="lesson-preview-heading" className="font-semibold">
            {t("training:focus.preview")}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {course.targetVocabulary.slice(0, 5).map((word) => (
              <li
                key={word}
                className="rounded-lg border border-line-info bg-surface px-3 py-1.5 text-sm"
              >
                {word}
              </li>
            ))}
          </ul>
          <ul className="divide-y divide-line-info">
            {template.targetPatterns.slice(0, 3).map(({ pattern, example }) => (
              <li key={pattern} className="py-2 text-sm text-ink">
                {example}
              </li>
            ))}
          </ul>
          {course.category === "personalized" && (
            <div className="border-t border-line-info pt-4 text-sm">
              <p>{template.setting}</p>
              <p className="mt-2 text-ink-muted">
                {t("training:practicePartner")}
                {template.roles.partner}
                {" · "}
                {t("common:workspace.duration", {
                  minutes: formatNumber(template.estimatedMinutes),
                })}
              </p>
              <h4 className="mt-4 font-semibold">{t("common:courseDesigner.outcomes")}</h4>
              <ol className="mt-2 list-decimal space-y-2 pl-5">
                {template.stages.map((stage) => (
                  <li key={stage.id}>
                    <span className="font-medium">{stage.title}</span>
                    {stage.objectiveIds.map((id) => (
                      <p key={id}>{course.objectives[Number(id.slice(4)) - 1]}</p>
                    ))}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}
      {!!course.courseTemplate?.learningPack?.variations.length && (
        <label className="block text-sm">
          {t("training:courseChallenge")}
          <select
            className={control}
            disabled={busy}
            value={variationId}
            onChange={(event) => setVariationId(event.target.value)}
          >
            <option value="standard">{t("training:standardCheckIn")}</option>
            {course.courseTemplate.learningPack.variations.map((variation) => (
              <option key={variation.id} value={variation.id}>
                {variation.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {template?.learningPack && (
        <details className="rounded-lg border border-line px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            {t("training:lessonReference")}
          </summary>
          <div className="mt-3">
            <CourseStudyPack template={template} />
          </div>
        </details>
      )}
      <label className="block text-sm">
        {t("training:practiceMode")}
        <select
          className={control}
          value={selectedMode}
          disabled={busy}
          onChange={(event) => setMode(event.target.value === "ai" ? "ai" : "demo")}
        >
          {supportsGuidedDemo(course) && <option value="demo">{t("training:guidedDemo")}</option>}
          <option value="ai">{t("training:connectedAI")}</option>
        </select>
      </label>
      {selectedMode === "demo" ? (
        <p className="text-sm text-ink-muted">
          {t("training:theGuidedDemoChecksSuggestedExampleRepliesOnlyConnectAI")}
        </p>
      ) : (
        <p className="text-sm text-ink-muted">
          {t("training:connectAIUsesTheEndpointConfiguredInSettings", {
            endpoint: providerSettings.baseUrl,
            model: providerSettings.model,
          })}
        </p>
      )}
      <div className="sticky bottom-0 z-10 -mx-5 -mb-5 rounded-b-2xl border-t border-line bg-surface px-5 py-3 sm:-mx-7 sm:-mb-7 sm:px-7">
        <button
          className="w-full rounded-xl button-primary px-5 py-3 font-semibold disabled:opacity-50"
          disabled={busy || (selectedMode === "ai" && providerLoading)}
          type="submit"
        >
          {busy ? t("training:starting") : t("training:startLesson")}
        </button>
      </div>
    </form>
  );
}
