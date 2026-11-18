import { LocalizedError } from "../components/LocalizedError";
import { formatDateTime } from "../i18n";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { LearningReport } from "../components/LearningReport";
import { useTrainingStore } from "../stores/training";
import { useNavStore } from "../stores/nav";
import type { TrainingSession } from "../training/session";

const button = "rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40";
const control = "mt-1 block w-full rounded border border-slate-300 p-2 text-sm";

function Reflection({ session }: { session: TrainingSession }) {
  const { t } = useTranslation();
  const { busy, saveReflection } = useTrainingStore();
  const [note, setNote] = useState(session.reportReflection?.note ?? "");
  const [nextPractice, setNextPractice] = useState(session.reportReflection?.nextPractice ?? "");
  const dirty =
    note !== (session.reportReflection?.note ?? "") ||
    nextPractice !== (session.reportReflection?.nextPractice ?? "");
  return (
    <form
      aria-label={t("reports:lessonReflection")}
      className="space-y-3 rounded border border-slate-200 bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void saveReflection({ note, nextPractice });
      }}
    >
      <h2 className="font-semibold">{t("reports:yourReflection")}</h2>
      <p className="text-sm text-slate-500">
        {t("reports:aPersonalSelfCheckSeparateFromTheLessonEvidenceAnd")}
      </p>
      <label className="block text-sm">
        {t("reports:whatFeltEasyOrDifficult")}
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
        {t("reports:myNextPracticeCommitment")}
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
          ? t("reports:unsavedReflection")
          : session.reportReflection
            ? t("reports:reflectionSavedOnThisDevice")
            : t("reports:noReflectionSavedYet")}
      </p>
      <button type="submit" className={button} disabled={busy || !dirty}>
        {t("reports:saveReflection")}
      </button>
    </form>
  );
}

export function ReportsPage() {
  const { t } = useTranslation();
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
    <section aria-label={t("reports:reports")} className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("reports:reports")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("reports:reviewCompletedLessonsInspectYourEvidenceAndChooseTheNext")}
          </p>
        </div>
        <button className={button} disabled={busy} onClick={() => void reload()}>
          {t("reports:refreshReports")}
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <LocalizedError error={error} />
          <button className="ml-3 underline" disabled={busy} onClick={() => void reload()}>
            {t("reports:retryReportLoad")}
          </button>
        </div>
      )}
      {!loaded && !error && <p role="status">{t("reports:loadingReports")}</p>}
      {loaded && (
        <>
          <label className="block max-w-xs text-sm">
            {t("reports:reportMode")}
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
              <option value="">{t("reports:allModes")}</option>
              <option value="ai">{t("reports:aIConversation")}</option>
              <option value="demo">{t("reports:guidedDemo")}</option>
            </select>
          </label>
          {!reports.length && (
            <p className="rounded border border-slate-200 bg-white p-5 text-sm">
              {t("reports:noCompletedReportsInThisViewFinishALessonAnd")}
            </p>
          )}
          <ul aria-label={t("reports:reportHistory")} className="grid gap-2 sm:grid-cols-2">
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
                    {item.mode === "demo" ? t("reports:guidedDemo") : t("reports:aIConversation")} ·{" "}
                    {item.language} {t("reports:lastSaved")}
                    {formatDateTime(item.at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {reports.length > limit && (
            <button className={button} onClick={() => setLimit(limit + 20)}>
              {t("reports:showMoreReports")}
            </button>
          )}
          {busy && selected && !reportSession && (
            <p role="status">{t("reports:loadingLessonReport")}</p>
          )}
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
                  {t("reports:openSourceLesson")}
                </button>
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => {
                    prepare(reportSession.scenario);
                    navigate("training");
                  }}
                >
                  {t("reports:practiseThisCourseAgain")}
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
