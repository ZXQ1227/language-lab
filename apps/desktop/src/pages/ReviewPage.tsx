import { LocalizedError } from "../components/LocalizedError";
import { formatDateTime, formatNumber } from "../i18n";
import { useTranslation } from "react-i18next";
import { uiValue } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { checkReviewAnswer, type ReviewTask, type ReviewPlan } from "@language-lab/core";
import { useTrainingStore } from "../stores/training";
import { useNavStore } from "../stores/nav";
import type { TrainingSession } from "../training/session";
import { nextDayTransferResult } from "../training/travelTransfer";

const button = "rounded button-primary px-3 py-2 text-sm disabled:opacity-40";
const control = "mt-1 block w-full rounded border form-control p-2 text-sm";
const feedback = {
  reference_match: "review:feedback.reference_match",
  reference_differs: "review:feedback.reference_differs",
  target_observed: "review:feedback.target_observed",
  target_missing: "review:feedback.target_missing",
  self_check: "review:feedback.self_check",
};
const kind = {
  error_practice: "review:kind.error_practice",
  vocabulary_drill: "review:kind.vocabulary_drill",
  course_practice: "review:kind.course_practice",
};

function ReviewPractice({ session, task }: { session: TrainingSession; task: ReviewTask }) {
  const { t } = useTranslation();
  const { busy, saveReviewAttempt } = useTrainingStore();
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [revealed, setRevealed] = useState(false);
  return (
    <section
      aria-label={t("review:targetedReviewPractice")}
      className="space-y-4 rounded border border-line-info bg-surface p-5"
    >
      <h2 className="font-semibold">{t(kind[task.kind])}</h2>
      <p className="text-sm">
        {session.scenario.title} · {session.state.difficulty} ·{" "}
        {session.state.courseTemplate?.targetLanguage}
      </p>
      {session.provider.mode === "demo" && (
        <p className="text-xs text-ink-muted">
          {t("review:basedOnGuidedDemoEvidenceDemoDiagnosesCoverLimitedExamples")}
        </p>
      )}
      <p className="text-sm">{task.prompt}</p>
      {task.kind === "error_practice" && (
        <div className="space-y-1 rounded bg-chat-error p-3 text-sm text-error-ink">
          <blockquote className="break-words">
            “{task.evidence.context.slice(0, task.error.start)}
            <mark className="rounded-sm bg-error-mark text-error-ink">
              {task.evidence.context.slice(task.error.start, task.error.end)}
            </mark>
            {task.evidence.context.slice(task.error.end)}”
          </blockquote>
          <p className="text-xs text-ink-muted">
            {t("review:sourceMessage")}
            {formatNumber(task.evidence.messageSeq)} · {formatNumber(task.observedTurns)}{" "}
            {t("review:observedPracticeReplies")}{" "}
            {task.diagnosisSource === "demo"
              ? t("review:limitedDemoCheck")
              : t("review:modelSuggestionMayBeWrong")}
            {task.diagnosisStatus === "uncertain" ? t("review:partialOrUncertainSourceCheck") : ""}
          </p>
        </div>
      )}
      {task.kind === "vocabulary_drill" && task.meaning && (
        <p className="text-sm">
          {t("review:meaning")}
          {task.meaning}
        </p>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer">{t("review:scenarioAndGoalsForSelfCheck")}</summary>
        <p className="mt-2">{session.state.courseTemplate?.setting}</p>
        <ul className="mt-2 list-disc pl-5">
          {session.state.objectives.map((objective) => (
            <li key={objective.id}>{objective.description}</li>
          ))}
        </ul>
      </details>
      {session.state.courseTemplate?.learningPack && (
        <details className="text-sm">
          <summary className="cursor-pointer">{t("review:courseFactsForSelfCheck")}</summary>
          <ul className="mt-2 list-disc pl-5">
            {session.state.courseTemplate.learningPack.scenarioFacts.map((fact) => (
              <li key={fact.label}>
                {fact.label}: {fact.value}
              </li>
            ))}
          </ul>
        </details>
      )}
      <label className="block text-sm">
        {t("review:yourReviewAnswer")}
        <textarea
          className={control}
          rows={3}
          maxLength={2000}
          disabled={busy}
          value={answer}
          onChange={(e) => {
            setAnswer(e.target.value);
            setChecked(false);
          }}
        />
      </label>
      <div className="flex gap-3">
        <button
          className={button}
          disabled={busy || !answer.trim()}
          onClick={() => setChecked(true)}
        >
          {t("review:checkMyAnswer")}
        </button>
        {task.reference && (
          <button
            className="text-sm underline disabled:opacity-40"
            disabled={busy || revealed}
            onClick={() => setRevealed(true)}
          >
            {t("review:revealExample")}
          </button>
        )}
      </div>
      {revealed && (
        <div
          aria-label={t("review:reviewExample")}
          className="space-y-2 rounded bg-surface-secondary p-3 text-sm"
        >
          <p className="break-words">{task.reference}</p>
          {task.kind === "error_practice" && <p>{task.error.explanation}</p>}
          <p className="text-xs text-ink-muted">
            {t("review:exampleRevealedThisAttemptWillBeRecordedAsSupportedPractice")}
          </p>
        </div>
      )}
      {checked && (
        <p role="status" className="rounded bg-chat-success p-3 text-sm text-success-ink">
          {t(feedback[checkReviewAnswer(task, answer)])}
        </p>
      )}
      <p className="text-xs text-ink-muted">
        {t("review:chooseYourOwnNextStepAfterCheckingPractisedMeansYou")}
      </p>
      <div className="flex gap-3">
        <button
          className={button}
          disabled={busy || !checked || !answer.trim()}
          onClick={() =>
            void saveReviewAttempt(session.id, task.id, {
              answer,
              exampleRevealed: revealed,
              rating: "again",
            })
          }
        >
          {t("review:saveAndTryTomorrow")}
        </button>
        <button
          className={button}
          disabled={busy || !checked || !answer.trim()}
          onClick={() =>
            void saveReviewAttempt(session.id, task.id, {
              answer,
              exampleRevealed: revealed,
              rating: "practised",
            })
          }
        >
          {t("review:markPractised")}
        </button>
      </div>
    </section>
  );
}

function AttemptHistory({ progress }: { progress: ReviewPlan["progress"][number] }) {
  const { t } = useTranslation();
  if (!progress.attemptCount) return null;
  return (
    <details
      aria-label={t("review:reviewAttemptHistory")}
      className="rounded border border-line bg-surface p-4 text-sm"
      open={progress.status === "done"}
    >
      <summary className="cursor-pointer">
        {formatNumber(progress.attemptCount)} {t("review:savedAttempts")}{" "}
        {progress.status === "done"
          ? t("review:practisedSelfReported")
          : t("review:pendingTryAgain")}
      </summary>
      <p className="mt-2 text-xs text-ink-muted">
        {t("review:showingTheLatest10AttemptsTheseAnswersAreSeparateFrom")}
      </p>
      <ol className="mt-3 space-y-3">
        {[...progress.attempts].reverse().map((attempt) => (
          <li key={attempt.number}>
            <p>
              {t("review:attempt")}
              {formatNumber(attempt.number)} · {formatDateTime(attempt.at)} ·{" "}
              {attempt.exampleRevealed
                ? t("review:exampleRevealed")
                : t("review:exampleNotRevealed")}
            </p>
            <blockquote className="break-words text-ink-muted">“{attempt.answer}”</blockquote>
            <p className="text-xs">{t(feedback[attempt.check])}</p>
            <p className="text-xs">
              {t("review:yourChoice")}
              {attempt.rating === "again" ? t("review:tryAgain") : t("review:practised")}
            </p>
          </li>
        ))}
      </ol>
    </details>
  );
}

export function ReviewPage({ sentencesOnly = false }: { sentencesOnly?: boolean }) {
  const { t } = useTranslation();
  const {
    reviewPlans,
    travelTransfers,
    openTravelTransfer,
    reviewsLoaded,
    reportSession,
    learningMemory,
    busy,
    error,
    loadReviews,
    loadReport,
    openLesson,
  } = useTrainingStore();
  const navigate = useNavStore((s) => s.navigate);
  const [selected, setSelected] = useState(
    sentencesOnly
      ? ""
      : (reportSession?.reviewPlan?.progress.find((p) => p.status === "pending")?.taskId ?? ""),
  );
  const initialLoad = useRef(false);
  const [filter, setFilter] = useState("pending");
  const [limit, setLimit] = useState(20);
  const queue = reviewPlans
    .flatMap((plan) =>
      plan.tasks.map((task) => ({
        plan,
        task,
        progress: plan.progress.find((p) => p.taskId === task.id)!,
      })),
    )
    .filter(({ task }) => !sentencesOnly || task.kind === "course_practice")
    .sort((a, b) => a.progress.dueAt - b.progress.dueAt || a.task.id.localeCompare(b.task.id));
  const now = Date.now();
  const transferRate = nextDayTransferResult(travelTransfers, now);
  const matching = queue.filter(
    (entry) =>
      filter === "all" ||
      (filter === "due"
        ? entry.progress.status === "pending" && entry.progress.dueAt <= now
        : entry.progress.status === filter),
  );
  const active = queue.find((entry) => entry.task.id === selected);
  const canonicalTask =
    reportSession?.id === active?.plan.lessonId
      ? reportSession?.reviewPlan?.tasks.find((t) => t.id === selected)
      : undefined;
  const progress = canonicalTask
    ? reportSession!.reviewPlan!.progress.find((p) => p.taskId === selected)
    : undefined;
  const reload = async () => {
    await loadReviews();
    if (!useTrainingStore.getState().error && active) await loadReport(active.plan.lessonId);
  };
  useEffect(() => {
    if (!busy && !initialLoad.current && !useTrainingStore.getState().busy) {
      initialLoad.current = true;
      void loadReviews();
    }
  }, [busy, loadReviews]);
  useEffect(() => {
    if (
      reviewsLoaded &&
      !busy &&
      !useTrainingStore.getState().busy &&
      !error &&
      !selected &&
      matching[0]
    ) {
      setSelected(matching[0].task.id);
      void loadReport(matching[0].plan.lessonId);
    }
  }, [reviewsLoaded, busy, error, selected, matching, loadReport]);
  return (
    <section
      aria-label={sentencesOnly ? t("common:workspace.pages.sentences") : t("review:review")}
      className="mx-auto max-w-5xl space-y-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {sentencesOnly ? t("common:workspace.pages.sentences") : t("review:review")}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {t("review:shortFollowUpPracticeBasedOnYourSavedLessonEvidence")}
          </p>
        </div>
        <button className={button} disabled={busy} onClick={() => void reload()}>
          {t("review:refreshReviewQueue")}
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded border border-error-line bg-chat-error p-4 text-sm text-error-ink"
        >
          <LocalizedError error={error} />
          <button className="ml-3 underline" disabled={busy} onClick={() => void reload()}>
            {t("review:retryReviewLoad")}
          </button>
        </div>
      )}
      {!reviewsLoaded && !error && <p role="status">{t("review:loadingTargetedReview")}</p>}
      {reviewsLoaded && !sentencesOnly && (
        <section
          aria-labelledby="next-day-travel-heading"
          className="space-y-3 rounded-xl border border-line bg-surface p-4"
        >
          <h2 id="next-day-travel-heading" className="font-semibold">
            {t("review:travel.title")}
          </h2>
          <p className="text-sm text-ink-muted">{t("review:travel.description")}</p>
          <p className="text-sm">
            {transferRate.eligible
              ? t("review:travel.rate", {
                  rate: formatNumber(transferRate.completedOnTime / transferRate.eligible, {
                    style: "percent",
                  }),
                  completed: formatNumber(transferRate.completedOnTime),
                  eligible: formatNumber(transferRate.eligible),
                })
              : t("review:travel.noResult")}
          </p>
          <ul className="divide-y divide-line">
            {travelTransfers.map((task) => {
              const complete = task.attempt?.travelTransfer?.completedAt !== undefined;
              return (
                <li
                  key={task.source.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{task.source.scenario.title}</p>
                    <p className="text-xs text-ink-muted">
                      {t("review:travel.window", {
                        date: formatDateTime(task.dueAt),
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={button}
                    disabled={busy || now < task.dueAt}
                    onClick={() =>
                      void openTravelTransfer(task.source.id).then((opened) => {
                        if (opened) navigate("training");
                      })
                    }
                  >
                    {t(
                      complete
                        ? "review:travel.open"
                        : task.attempt
                          ? "review:travel.resume"
                          : "review:travel.start",
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {reviewsLoaded && (
        <>
          <p aria-label={t("review:reviewQueueSummary")} className="text-sm">
            {t("review:dueNow")}{" "}
            {formatNumber(
              queue.filter((e) => e.progress.status === "pending" && e.progress.dueAt <= now)
                .length,
            )}{" "}
            {t("review:upcoming")}{" "}
            {formatNumber(
              queue.filter((e) => e.progress.status === "pending" && e.progress.dueAt > now).length,
            )}{" "}
            {t("review:practised2")}
            {formatNumber(queue.filter((e) => e.progress.status === "done").length)}
          </p>
          <label className="block max-w-xs text-sm">
            {t("review:reviewStatus")}
            <select
              className={control}
              value={filter}
              disabled={busy}
              onChange={(e) => {
                setFilter(e.target.value);
                setSelected("");
                setLimit(20);
              }}
            >
              <option value="pending">{t("review:pendingDueAndUpcoming")}</option>
              <option value="due">{t("review:dueNow2")}</option>
              <option value="done">{t("review:practised")}</option>
              <option value="all">{t("review:allTasks")}</option>
            </select>
          </label>
          {!matching.length && (
            <p className="rounded border border-line bg-surface p-5 text-sm">
              {t("review:noReviewTasksInThisViewCompleteALessonTo")}
            </p>
          )}
          <ul aria-label={t("review:reviewQueue")} className="grid gap-2 sm:grid-cols-2">
            {matching.slice(0, limit).map(({ plan, task, progress }) => (
              <li key={task.id}>
                <button
                  className={`w-full rounded border p-3 text-left text-sm disabled:opacity-40 ${selected === task.id ? "border-brand-primary bg-brand-primary-soft" : "border-line bg-surface"}`}
                  disabled={busy}
                  aria-pressed={selected === task.id}
                  onClick={() => {
                    setSelected(task.id);
                    void loadReport(plan.lessonId);
                  }}
                >
                  <span className="block font-medium">
                    {t(kind[task.kind])}
                    {task.kind === "vocabulary_drill"
                      ? t("review:value", { v0: uiValue(task.term) })
                      : ""}
                  </span>
                  <span className="block text-xs text-ink-muted">
                    {learningMemory?.episodes.find((e) => e.lessonId === plan.lessonId)?.title ??
                      t("review:savedLesson")}{" "}
                    · {plan.difficulty} · {plan.language}
                  </span>
                  <span className="mt-1 block text-xs text-ink-muted">
                    <span
                      className={`inline-block rounded-md px-1.5 py-0.5 font-medium ${progress.status === "done" ? "bg-chat-success text-success-ink" : "bg-chat-hint text-hint-ink"}`}
                    >
                      {progress.status === "done"
                        ? t("review:practised")
                        : progress.dueAt <= now
                          ? t("review:due")
                          : t("review:upcoming2")}
                    </span>{" "}
                    {t("review:suggestedDate")}
                    {formatDateTime(progress.dueAt)} {t("review:attempts")}{" "}
                    {formatNumber(progress.attemptCount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {matching.length > limit && (
            <button className={button} onClick={() => setLimit(limit + 20)}>
              {t("review:showMoreReviewTasks")}
            </button>
          )}
          {busy && active && !canonicalTask && (
            <p role="status">{t("review:loadingSourcePractice")}</p>
          )}
          {active && canonicalTask && progress && reportSession && (
            <>
              <div className="flex gap-3">
                <button
                  className={button}
                  disabled={busy}
                  onClick={() =>
                    void openLesson(active.plan.lessonId).then((opened) => {
                      if (opened) navigate("training");
                    })
                  }
                >
                  {t("review:openSourceLesson")}
                </button>
                <button className={button} disabled={busy} onClick={() => navigate("reports")}>
                  {t("review:openLessonReport")}
                </button>
              </div>
              {progress.status === "pending" ? (
                <ReviewPractice
                  key={`${selected}:${progress.attemptCount}`}
                  session={reportSession}
                  task={canonicalTask}
                />
              ) : (
                <p role="status" className="rounded bg-chat-success p-4 text-sm text-success-ink">
                  {t("review:practiceSavedChooseAnotherPendingTaskWhenYouAreReady")}
                </p>
              )}
              <AttemptHistory progress={progress} />
            </>
          )}
        </>
      )}
    </section>
  );
}
