import { useEffect, useState } from "react";
import { LearningReport } from "../components/LearningReport";
import { useTrainingStore } from "../stores/training";
import { useNavStore } from "../stores/nav";
import type { TrainingSession } from "../training/session";

const button = "rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40";
const control = "mt-1 block w-full rounded border border-slate-300 p-2 text-sm";

function Reflection({ session }: { session: TrainingSession }) {
  const { busy, saveReflection } = useTrainingStore();
  const [note, setNote] = useState(session.reportReflection?.note ?? "");
  const [nextPractice, setNextPractice] = useState(session.reportReflection?.nextPractice ?? "");
  const dirty =
    note !== (session.reportReflection?.note ?? "") ||
    nextPractice !== (session.reportReflection?.nextPractice ?? "");
  return (
    <form
      aria-label="Lesson reflection"
      className="space-y-3 rounded border border-slate-200 bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void saveReflection({ note, nextPractice });
      }}
    >
      <h2 className="font-semibold">Your reflection</h2>
      <p className="text-sm text-slate-500">
        A personal self-check, separate from the lesson evidence and model commentary.
      </p>
      <label className="block text-sm">
        What felt easy or difficult?
        <textarea
          className={control}
          rows={3}
          maxLength={2000}
          disabled={busy}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        My next practice commitment
        <textarea
          className={control}
          rows={2}
          maxLength={500}
          disabled={busy}
          value={nextPractice}
          onChange={(e) => setNextPractice(e.target.value)}
        />
      </label>
      <p role="status" className="text-xs text-slate-500">
        {dirty
          ? "Unsaved reflection."
          : session.reportReflection
            ? "Reflection saved on this device."
            : "No reflection saved yet."}
      </p>
      <button type="submit" className={button} disabled={busy || !dirty}>
        Save reflection
      </button>
    </form>
  );
}

export function ReportsPage() {
  const {
    learningMemory,
    reportSession,
    loaded,
    busy,
    error,
    load,
    loadReport,
    openLesson,
    prepare,
  } = useTrainingStore();
  const navigate = useNavStore((s) => s.navigate);
  const [selected, setSelected] = useState(reportSession?.id ?? "");
  const [mode, setMode] = useState("");
  const [limit, setLimit] = useState(20);
  const reports =
    learningMemory?.episodes.filter((e) => e.completed && (!mode || e.mode === mode)) ?? [];
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  useEffect(() => {
    if (loaded && !selected && reports[0] && !busy) {
      setSelected(reports[0].lessonId);
      void loadReport(reports[0].lessonId);
    }
  }, [loaded, selected, reports, busy, loadReport]);
  const reload = async () => {
    await load();
    if (!useTrainingStore.getState().error && selected) await loadReport(selected);
  };
  return (
    <section aria-label="Reports" className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="mt-1 text-sm text-slate-500">
            Review completed lessons, inspect your evidence and choose the next practice.
          </p>
        </div>
        <button className={button} disabled={busy} onClick={() => void reload()}>
          Refresh reports
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
          <button className="ml-3 underline" disabled={busy} onClick={() => void reload()}>
            Retry report load
          </button>
        </div>
      )}
      {!loaded && !error && <p role="status">Loading reports…</p>}
      {loaded && (
        <>
          <label className="block max-w-xs text-sm">
            Report mode
            <select
              className={control}
              value={mode}
              disabled={busy}
              onChange={(e) => {
                setMode(e.target.value);
                setLimit(20);
                setSelected("");
              }}
            >
              <option value="">All modes</option>
              <option value="ai">AI conversation</option>
              <option value="demo">Guided demo</option>
            </select>
          </label>
          {!reports.length && (
            <p className="rounded border border-slate-200 bg-white p-5 text-sm">
              No completed reports in this view. Finish a lesson and choose “Finish and review” to
              save a report.
            </p>
          )}
          <ul aria-label="Report history" className="grid gap-2 sm:grid-cols-2">
            {reports.slice(0, limit).map((item) => (
              <li key={item.lessonId}>
                <button
                  disabled={busy}
                  aria-pressed={selected === item.lessonId}
                  className={`w-full rounded border p-3 text-left text-sm disabled:opacity-40 ${selected === item.lessonId ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white"}`}
                  onClick={() => {
                    setSelected(item.lessonId);
                    void loadReport(item.lessonId);
                  }}
                >
                  <span className="block font-medium">
                    {item.title} · {item.difficulty}
                  </span>
                  <span className="text-xs text-slate-500">
                    {item.mode === "demo" ? "Guided demo" : "AI conversation"} · {item.language} ·
                    Last saved: {new Date(item.at).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {reports.length > limit && (
            <button className={button} onClick={() => setLimit(limit + 20)}>
              Show more reports
            </button>
          )}
          {busy && selected && !reportSession && <p role="status">Loading lesson report…</p>}
          {reportSession && reportSession.id === selected && (
            <>
              <div className="flex gap-3">
                <button
                  className={button}
                  disabled={busy}
                  onClick={() =>
                    void openLesson(reportSession.id).then((opened) => {
                      if (opened) navigate("training");
                    })
                  }
                >
                  Open source lesson
                </button>
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => {
                    prepare(reportSession.scenario);
                    navigate("training");
                  }}
                >
                  Practise this course again
                </button>
              </div>
              <LearningReport session={reportSession} />
              <Reflection
                key={`${reportSession.id}:${JSON.stringify(reportSession.reportReflection)}`}
                session={reportSession}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
