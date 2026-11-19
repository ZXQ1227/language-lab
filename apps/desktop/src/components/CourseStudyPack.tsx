import { formatNumber } from "../i18n";
import { useTranslation } from "react-i18next";
import { uiValue } from "../i18n";
import { useState } from "react";
import type { CourseTemplate } from "@language-lab/core";
import type { TrainingSession } from "../training/session";

export function CourseStudyPack({ template }: { template: CourseTemplate }) {
  const { t } = useTranslation();
  const pack = template.learningPack;
  if (!pack) return null;
  const challenge = pack.variations.find((item) => item.id === template.selectedVariationId);
  return (
    <section
      aria-label={t("course:courseStudyPack")}
      className="space-y-4 rounded-lg border border-line bg-surface p-4 text-sm text-ink-muted"
    >
      <div>
        <h3 className="font-semibold text-ink">
          {t("course:yourCompleteLesson")}
          {formatNumber(template.stages.length)} {t("course:steps")}
          {formatNumber(template.estimatedMinutes)} {t("course:minutes")}
        </h3>
        <p className="mt-2">{pack.overview}</p>
      </div>
      {challenge && (
        <div className="rounded-md bg-chat-hint p-3 text-hint-ink">
          <h4 className="font-medium">
            {t("course:challenge")}
            {challenge.title}
          </h4>
          <p>{challenge.briefing}</p>
        </div>
      )}
      {pack.prerequisites.length > 0 && (
        <div>
          <h4 className="font-medium text-ink">{t("course:beforeYouStart")}</h4>
          <ul className="mt-1 list-disc pl-5">
            {pack.prerequisites.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      <details>
        <summary className="cursor-pointer font-medium text-ink">
          {t("course:scenarioBrief")}
        </summary>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          {pack.scenarioFacts.map((fact) => (
            <div key={fact.label} className="rounded bg-surface-secondary p-2">
              <dt className="font-medium text-ink">{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </details>
      <details>
        <summary className="cursor-pointer font-medium text-ink">
          {t("course:warmUp")}
          {formatNumber(pack.warmup.length)} {t("course:shortTasks")}
        </summary>
        <ol className="mt-3 list-decimal space-y-3 pl-5">
          {pack.warmup.map((exercise) => (
            <li key={exercise.id}>
              <p>{exercise.prompt}</p>
              <details className="mt-1">
                <summary className="cursor-pointer text-ink-muted">
                  {t("course:compareWithASampleAnswer")}
                </summary>
                <p className="mt-1 rounded bg-surface-secondary p-2">{exercise.suggestedAnswer}</p>
              </details>
            </li>
          ))}
        </ol>
      </details>
      <details>
        <summary className="cursor-pointer font-medium text-ink">
          {t("course:vocabularyAndMeaning")}
          {formatNumber(pack.vocabulary.length)} {t("course:wordsAndPhrases")}
        </summary>
        <dl className="mt-3 space-y-3">
          {pack.vocabulary.map((item) => (
            <div key={item.term} className="border-l-2 border-line-info pl-3">
              <dt className="font-medium text-ink">
                {item.term}
                {item.translation ? t("course:value", { v0: uiValue(item.translation) }) : ""}
              </dt>
              <dd>
                {item.meaning}
                <p className="mt-1 italic">{item.example}</p>
                {item.forms?.length ? (
                  <p className="mt-1 text-xs text-ink-muted">
                    {t("course:acceptedForms")}
                    {item.forms.join(", ")}
                  </p>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </details>
      <details>
        <summary className="cursor-pointer font-medium text-ink">
          {t("course:usefulExpressions")}
          {formatNumber(template.targetPatterns.length)} {t("course:patterns")}
        </summary>
        <dl className="mt-3 space-y-2">
          {template.targetPatterns.map((item) => (
            <div key={item.pattern}>
              <dt lang={template.targetLanguage} className="font-medium text-ink">
                {item.pattern}
              </dt>
              {item.example !== item.pattern && (
                <dd lang={template.targetLanguage}>{item.example}</dd>
              )}
              {item.translation && (
                <dd className="mt-1 w-fit rounded-md bg-chat-translation px-2 py-0.5 text-ink-muted">
                  {item.translation}
                </dd>
              )}
            </div>
          ))}
        </dl>
      </details>
      {pack.languageNotes && (
        <details>
          <summary className="cursor-pointer font-medium text-ink">
            {t("course:languageNotes")}
          </summary>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            {pack.languageNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </details>
      )}
      <details>
        <summary className="cursor-pointer font-medium text-ink">
          {t("course:modelConversationStandardScenario")}
        </summary>
        <p className="mt-2 text-xs text-ink-muted">
          {t("course:readForUsefulLanguageThenPractiseYourOwnRepliesChallenges")}
        </p>
        <ol className="mt-3 space-y-2">
          {pack.modelDialogue.map((line, index) => (
            <li key={index} className="rounded bg-surface-secondary p-2">
              <span className="font-medium">
                {line.role === "learner" ? t("course:you") : t("course:practicePartner")}:{" "}
              </span>
              {line.text}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

export function CourseReviewPractice({
  session,
  busy,
  onSave,
}: {
  session: TrainingSession;
  busy: boolean;
  onSave: (answers: Record<string, string>) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const pack = session.state.courseTemplate?.learningPack;
  const [answers, setAnswers] = useState<Record<string, string>>(session.reviewAnswers ?? {});
  const [saved, setSaved] = useState(false);
  if (!pack) return null;
  return (
    <section
      aria-label={t("course:independentReviewPractice")}
      className="space-y-4 rounded-lg border border-line bg-surface p-5"
    >
      <h2 className="font-semibold text-ink">{t("course:independentReviewPractice")}</h2>
      <p className="text-sm text-ink-muted">
        {t("course:tryFromMemoryThenCompareWithTheExamplesTheseAnswers")}
      </p>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(answers).then(setSaved);
        }}
      >
        {pack.reviewPractice.map((exercise, index) => (
          <div key={exercise.id} className="space-y-2 text-sm">
            <p className="font-medium text-ink">
              {formatNumber(index + 1)}. {exercise.prompt}
            </p>
            <label className="block text-ink-muted">
              {t("course:reviewAnswer")}
              {formatNumber(index + 1)}
              <textarea
                className="mt-1 w-full rounded-md border form-control px-3 py-2"
                rows={3}
                maxLength={2000}
                disabled={busy}
                value={answers[exercise.id] ?? ""}
                onChange={(event) => {
                  setAnswers((current) => ({ ...current, [exercise.id]: event.target.value }));
                  setSaved(false);
                }}
              />
            </label>
            <details className="text-ink-muted">
              <summary className="cursor-pointer">{t("course:compareWithExample")}</summary>
              <p className="mt-2 rounded bg-surface-secondary p-3">{exercise.suggestedAnswer}</p>
            </details>
          </div>
        ))}
        <button
          type="submit"
          disabled={busy || !Object.values(answers).some((answer) => answer.trim())}
          className="rounded-md button-primary px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {t("course:saveReviewAnswers")}
        </button>
        {saved && (
          <p role="status" className="text-sm text-brand-ink">
            {t("course:reviewAnswersSavedOnThisDevice")}
          </p>
        )}
      </form>
    </section>
  );
}
