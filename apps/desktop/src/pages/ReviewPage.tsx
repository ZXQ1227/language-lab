import { useEffect, useState } from "react";
import { checkReviewAnswer, type ReviewTask, type ReviewPlan } from "@language-lab/core";
import { useTrainingStore } from "../stores/training";
import { useNavStore } from "../stores/nav";
import type { TrainingSession } from "../training/session";

const button = "rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40";
const control = "mt-1 block w-full rounded border border-slate-300 p-2 text-sm";
const feedback = {
  reference_match:
    "Matches the reference wording. This is a recall check, not a grammar assessment.",
  reference_differs:
    "Your wording differs from the reference. Another answer may be valid; compare the suggestion and original context.",
  target_observed:
    "Target expression observed. Check the meaning and sentence yourself; this is not a correctness assessment.",
  target_missing:
    "The target expression was not found. Try the target term or an accepted course form, then check again.",
  self_check:
    "Compare your reply with the course facts, goals and example, then record your own judgment.",
};
const kind = {
  error_practice: "Recall a correction",
  vocabulary_drill: "Use a missed word",
  course_practice: "Apply it in context",
};

function ReviewPractice({ session, task }: { session: TrainingSession; task: ReviewTask }) {
  const { busy, saveReviewAttempt } = useTrainingStore();
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [revealed, setRevealed] = useState(false);
  return (
    <section
      aria-label="Targeted review practice"
      className="space-y-4 rounded border border-emerald-200 bg-white p-5"
    >
      <h2 className="font-semibold">{kind[task.kind]}</h2>
      <p className="text-sm">
        {session.scenario.title} · {session.state.difficulty} ·{" "}
        {session.state.courseTemplate?.targetLanguage}
      </p>
      {session.provider.mode === "demo" && (
        <p className="text-xs text-slate-500">
          Based on guided demo evidence. Demo diagnoses cover limited examples.
        </p>
      )}
      <p className="text-sm">{task.prompt}</p>
      {task.kind === "error_practice" && (
        <div className="space-y-1 rounded bg-slate-50 p-3 text-sm">
          <blockquote className="break-words">
            “{task.evidence.context.slice(0, task.error.start)}
            <mark>{task.evidence.context.slice(task.error.start, task.error.end)}</mark>
            {task.evidence.context.slice(task.error.end)}”
          </blockquote>
          <p className="text-xs text-slate-500">
            Source message #{task.evidence.messageSeq} · {task.observedTurns} observed practice
            replies ·{" "}
            {task.diagnosisSource === "demo"
              ? "Limited demo check"
              : "Model suggestion; may be wrong"}
            {task.diagnosisStatus === "uncertain" ? " · Partial or uncertain source check" : ""}
          </p>
        </div>
      )}
      {task.kind === "vocabulary_drill" && task.meaning && (
        <p className="text-sm">Meaning: {task.meaning}</p>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer">Scenario and goals for self-check</summary>
        <p className="mt-2">{session.state.courseTemplate?.setting}</p>
        <ul className="mt-2 list-disc pl-5">
          {session.state.objectives.map((objective) => (
            <li key={objective.id}>{objective.description}</li>
          ))}
        </ul>
      </details>
      {session.state.courseTemplate?.learningPack && (
        <details className="text-sm">
          <summary className="cursor-pointer">Course facts for self-check</summary>
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
        Your review answer
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
          Check my answer
        </button>
        {task.reference && (
          <button
            className="text-sm underline disabled:opacity-40"
            disabled={busy || revealed}
            onClick={() => setRevealed(true)}
          >
            Reveal example
          </button>
        )}
      </div>
      {revealed && (
        <div aria-label="Review example" className="space-y-2 rounded bg-slate-50 p-3 text-sm">
          <p className="break-words">{task.reference}</p>
          {task.kind === "error_practice" && <p>{task.error.explanation}</p>}
          <p className="text-xs text-slate-500">
            Example revealed. This attempt will be recorded as supported practice.
          </p>
        </div>
      )}
      {checked && (
        <p role="status" className="rounded bg-emerald-50 p-3 text-sm">
          {feedback[checkReviewAnswer(task, answer)]}
        </p>
      )}
      <p className="text-xs text-slate-500">
        Choose your own next step after checking. Practised means you completed an attempt; it does
        not update mastery or erase the original issue. You can practise before the suggested date.
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
          Save and try tomorrow
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
          Mark practised
        </button>
      </div>
    </section>
  );
}

function AttemptHistory({ progress }: { progress: ReviewPlan["progress"][number] }) {
  if (!progress.attemptCount) return null;
  return (
    <details
      aria-label="Review attempt history"
      className="rounded border border-slate-200 bg-white p-4 text-sm"
      open={progress.status === "done"}
    >
      <summary className="cursor-pointer">
        {progress.attemptCount} saved attempts ·{" "}
        {progress.status === "done" ? "Practised · self-reported" : "Pending · try again"}
      </summary>
      <p className="mt-2 text-xs text-slate-500">
        Showing the latest 10 attempts. These answers are separate from the original lesson
        evidence.
      </p>
      <ol className="mt-3 space-y-3">
        {[...progress.attempts].reverse().map((attempt) => (
          <li key={attempt.number}>
            <p>
              Attempt {attempt.number} · {new Date(attempt.at).toLocaleString()} ·{" "}
              {attempt.exampleRevealed ? "Example revealed" : "Example not revealed"}
            </p>
            <blockquote className="break-words text-slate-600">“{attempt.answer}”</blockquote>
            <p className="text-xs">{feedback[attempt.check]}</p>
            <p className="text-xs">
              Your choice: {attempt.rating === "again" ? "Try again" : "Practised"}
            </p>
          </li>
        ))}
      </ol>
    </details>
  );
}

export function ReviewPage() {
  const {
    reviewPlans,
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
    reportSession?.reviewPlan?.progress.find((p) => p.status === "pending")?.taskId ?? "",
  );
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
    .sort((a, b) => a.progress.dueAt - b.progress.dueAt || a.task.id.localeCompare(b.task.id));
  const now = Date.now();
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
    void loadReviews();
  }, [loadReviews]);
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
    <section aria-label="Review" className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Review</h1>
          <p className="mt-1 text-sm text-slate-500">
            Short follow-up practice based on your saved lesson evidence.
          </p>
        </div>
        <button className={button} disabled={busy} onClick={() => void reload()}>
          Refresh review queue
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
          <button className="ml-3 underline" disabled={busy} onClick={() => void reload()}>
            Retry review load
          </button>
        </div>
      )}
      {!reviewsLoaded && !error && <p role="status">Loading targeted review…</p>}
      {reviewsLoaded && (
        <>
          <p aria-label="Review queue summary" className="text-sm">
            Due now:{" "}
            {queue.filter((e) => e.progress.status === "pending" && e.progress.dueAt <= now).length}{" "}
            · Upcoming:{" "}
            {queue.filter((e) => e.progress.status === "pending" && e.progress.dueAt > now).length}{" "}
            · Practised: {queue.filter((e) => e.progress.status === "done").length}
          </p>
          <label className="block max-w-xs text-sm">
            Review status
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
              <option value="pending">Pending · due and upcoming</option>
              <option value="due">Due now</option>
              <option value="done">Practised</option>
              <option value="all">All tasks</option>
            </select>
          </label>
          {!matching.length && (
            <p className="rounded border border-slate-200 bg-white p-5 text-sm">
              No review tasks in this view. Complete a lesson to generate follow-up practice, or
              open an older report and choose “Generate targeted review”.
            </p>
          )}
          <ul aria-label="Review queue" className="grid gap-2 sm:grid-cols-2">
            {matching.slice(0, limit).map(({ plan, task, progress }) => (
              <li key={task.id}>
                <button
                  className={`w-full rounded border p-3 text-left text-sm disabled:opacity-40 ${selected === task.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white"}`}
                  disabled={busy}
                  aria-pressed={selected === task.id}
                  onClick={() => {
                    setSelected(task.id);
                    void loadReport(plan.lessonId);
                  }}
                >
                  <span className="block font-medium">
                    {kind[task.kind]}
                    {task.kind === "vocabulary_drill" ? ` · ${task.term}` : ""}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {learningMemory?.episodes.find((e) => e.lessonId === plan.lessonId)?.title ??
                      "Saved lesson"}{" "}
                    · {plan.difficulty} · {plan.language}
                  </span>
                  <span className="text-xs text-slate-500">
                    {progress.status === "done"
                      ? "Practised"
                      : progress.dueAt <= now
                        ? "Due"
                        : "Upcoming"}{" "}
                    · Suggested date: {new Date(progress.dueAt).toLocaleString()} · Attempts:{" "}
                    {progress.attemptCount}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {matching.length > limit && (
            <button className={button} onClick={() => setLimit(limit + 20)}>
              Show more review tasks
            </button>
          )}
          {busy && active && !canonicalTask && <p role="status">Loading source practice…</p>}
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
                  Open source lesson
                </button>
                <button className={button} disabled={busy} onClick={() => navigate("reports")}>
                  Open lesson report
                </button>
              </div>
              {progress.status === "pending" ? (
                <ReviewPractice
                  key={`${selected}:${progress.attemptCount}`}
                  session={reportSession}
                  task={canonicalTask}
                />
              ) : (
                <p role="status" className="rounded bg-emerald-50 p-4 text-sm">
                  Practice saved. Choose another pending task when you are ready.
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
