import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cefrLevelSchema, type ScenarioContent } from "@language-lab/core";
import { loadScenarioContent } from "../content/scenarioContent";
import { matchesLibraryDifficulty } from "../content/courseDifficulty";
import { LocalizedError } from "../components/LocalizedError";
import { formatDateTime, formatNumber } from "../i18n";
import { useNavStore } from "../stores/nav";
import { useTrainingStore } from "../stores/training";
import { useSpeechLoop } from "../speech/useSpeechLoop";
import { characterVoiceStyle } from "../speech/voices";
import { isTrainingUnfinished } from "../training/session";

const courses = loadScenarioContent().filter((course) => course.courseTemplate);
const guidedCourse = courses.find((course) => course.slug === "hotel-checkin")!;
const panel = "rounded-2xl border border-line bg-surface p-5 sm:p-6";
const primary = "rounded-lg button-primary px-4 py-2.5 text-sm font-semibold disabled:opacity-50";
const secondary =
  "button-secondary rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50";

function useLearningOverview() {
  const store = useTrainingStore();
  const attempted = useRef(false);
  useEffect(() => {
    if (!store.loaded && !store.busy && !attempted.current) {
      attempted.current = true;
      void store.load();
    }
  }, [store.loaded, store.busy, store.load]);
  return store;
}

function OverviewStatus() {
  const { t } = useTranslation();
  const { error, busy, loaded, load } = useTrainingStore();
  if (error)
    return (
      <div
        role="alert"
        className="rounded-lg border border-error-line bg-chat-error p-3 text-sm text-error-ink"
      >
        <LocalizedError error={error} />
        <button
          type="button"
          className="mt-2 underline"
          disabled={busy}
          onClick={() => void load()}
        >
          {t("training:retry")}
        </button>
      </div>
    );
  return !loaded ? (
    <p role="status" className="text-sm text-ink-muted">
      {t("training:loadingSavedPractice")}
    </p>
  ) : null;
}

function prepareCourse(course: ScenarioContent) {
  const training = useTrainingStore.getState();
  if (training.busy) return;
  training.prepare(course);
  useNavStore.getState().navigate("training");
}

export function PlanPage() {
  const { t } = useTranslation();
  const { learningMemory, sessions, session, loaded, busy, resume, loadReport } =
    useLearningOverview();
  const navigate = useNavStore((state) => state.navigate);
  const [alternate, setAlternate] = useState(0);
  const profile = learningMemory?.profile;
  const target = profile?.targetLanguage.toLowerCase();
  const level = cefrLevelSchema.options.indexOf(profile?.level ?? "A2");
  const completed = new Set(
    sessions.filter((item) => item.state.phase === "done").map((item) => item.scenario.slug),
  );
  const choices = courses
    .filter((course) => {
      const language = course.courseTemplate!.targetLanguage.toLowerCase();
      return !target || language === target || language === target.split("-")[0];
    })
    .sort(
      (a, b) =>
        Math.abs(cefrLevelSchema.options.indexOf(a.difficulty) - level) -
          Math.abs(cefrLevelSchema.options.indexOf(b.difficulty) - level) ||
        Number(completed.has(a.slug)) - Number(completed.has(b.slug)),
    );
  const recommended = choices[alternate % choices.length];
  const ongoing =
    session && session.state.phase !== "done" && !isTrainingUnfinished(session)
      ? session
      : sessions.find((item) => item.state.phase !== "done" && !isTrainingUnfinished(item));
  const recent = learningMemory?.episodes.filter((item) => item.completed).slice(0, 3) ?? [];
  return (
    <section className="space-y-6" aria-labelledby="plan-heading">
      <header>
        <h1 id="plan-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("common:workspace.learningPlan")}
        </h1>
        <div className="mt-3 space-y-1 text-sm leading-relaxed text-brand-ink">
          <p lang="en" className="font-medium italic">
            {t("common:brand.taglineEnglish")}
          </p>
          <p lang="zh-Hans">{t("common:brand.taglineChinese")}</p>
        </div>
      </header>
      <OverviewStatus />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {ongoing && (
            <section className={panel}>
              <h2 className="font-semibold">{t("common:workspace.resume")}</h2>
              <p className="mt-2 text-xl">{ongoing.scenario.title}</p>
              <p className="mt-1 text-sm text-ink-muted">
                {t(`common:phases.${ongoing.state.phase}`)}
              </p>
              <button
                type="button"
                className={`${primary} mt-4`}
                disabled={busy}
                onClick={() => {
                  if (session?.id !== ongoing.id) resume(ongoing.id);
                  navigate("training");
                }}
              >
                {t("common:workspace.resumeAction")}
              </button>
            </section>
          )}
          <section
            className="rounded-2xl border border-line-info bg-brand-primary-subtle p-6 sm:p-8"
            aria-labelledby="suggested-heading"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="suggested-heading" className="text-sm font-semibold text-ink">
                {t("common:workspace.recommended")}
              </h2>
              <button
                type="button"
                className="text-sm font-semibold text-brand-ink underline underline-offset-4"
                onClick={() => navigate("memory")}
              >
                {t("common:workspace.preferences")}
              </button>
            </div>
            {recommended ? (
              <>
                <p className="mt-5 text-sm text-ink-muted">
                  {t(`common:categories.${recommended.category}`, {
                    defaultValue: recommended.category,
                  })}{" "}
                  · {recommended.difficulty}
                  {recommended.courseTemplate && (
                    <>
                      {" "}
                      ·{" "}
                      {t("common:workspace.duration", {
                        minutes: formatNumber(recommended.courseTemplate.estimatedMinutes),
                      })}
                    </>
                  )}
                </p>
                <h3 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
                  {recommended.title}
                </h3>
                <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink">
                  {recommended.objectives[0]}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className={primary}
                    disabled={!loaded || busy}
                    onClick={() => prepareCourse(recommended)}
                  >
                    {t("common:workspace.beginCourse")}
                  </button>
                  {choices.length > 1 && (
                    <button
                      type="button"
                      className={secondary}
                      onClick={() => setAlternate((index) => (index + 1) % choices.length)}
                    >
                      {t("common:workspace.anotherCourse")}
                    </button>
                  )}
                </div>
                <details key={recommended.slug} className="mt-5 border-t border-line-strong pt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-ink">
                    {t("common:workspace.coursePath")}
                  </summary>
                  <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink">
                    {recommended.courseTemplate?.stages.map((stage) => (
                      <li key={stage.id}>{stage.title}</li>
                    ))}
                  </ol>
                </details>
              </>
            ) : (
              <p className="mt-5 text-sm">
                {t("common:workspace.noMatchingCourse", { language: profile?.targetLanguage })}
              </p>
            )}
            <button
              type="button"
              className="mt-4 text-sm font-semibold text-brand-ink underline underline-offset-4"
              onClick={() => navigate("scenarios")}
            >
              {t("common:workspace.browseCourses")}
            </button>
          </section>
        </div>
        <section className={panel} aria-labelledby="recent-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="recent-heading" className="font-semibold">
              {t("common:workspace.recent")}
            </h2>
            <button
              type="button"
              className="text-sm font-semibold text-brand-ink underline underline-offset-4"
              onClick={() => navigate("reports")}
            >
              {t("common:workspace.allHistory")}
            </button>
          </div>
          {recent.length > 0 ? (
            <ul className="mt-3 divide-y divide-line">
              {recent.map((item) => (
                <li key={item.lessonId}>
                  <button
                    type="button"
                    className="w-full py-3 text-left text-sm hover:text-brand-ink disabled:opacity-50"
                    disabled={busy}
                    onClick={() => {
                      void loadReport(item.lessonId).then((opened) => {
                        if (opened) navigate("reports");
                      });
                    }}
                  >
                    <span className="block font-semibold">{item.title}</span>
                    <span className="mt-1 block text-xs text-ink-muted">
                      {formatDateTime(item.at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            loaded && (
              <p className="mt-3 text-sm text-ink-muted">{t("common:workspace.noHistory")}</p>
            )
          )}
        </section>
      </div>
      <div className="pointer-events-none fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 flex justify-center sm:inset-x-8 lg:right-10 lg:bottom-5 lg:left-64">
        <button
          type="button"
          onClick={() => navigate("freeConversation")}
          className="pointer-events-auto flex min-h-12 w-full max-w-4xl flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-full border border-line-info bg-surface/95 px-4 py-2 text-left text-sm shadow-md backdrop-blur-md hover:bg-brand-primary-soft sm:px-5"
          aria-labelledby="free-conversation-launch-title"
        >
          <span className="text-ink-muted">{t("common:freeConversation.invitation")}</span>
          <span
            id="free-conversation-launch-title"
            className="ml-auto inline-flex items-center gap-2 font-semibold text-brand-ink"
          >
            <span className="lesson-icon lesson-icon-mic" aria-hidden="true" />
            {t("common:freeConversation.title")}
          </span>
        </button>
      </div>
    </section>
  );
}

export function GuidedPracticePage() {
  const { t } = useTranslation();
  const busy = useTrainingStore((state) => state.busy);
  const difficulty = useNavStore((state) => state.libraryDifficulty);
  return (
    <section className="max-w-3xl space-y-5" aria-labelledby="guided-practice-heading">
      <h1 id="guided-practice-heading" className="text-3xl font-semibold tracking-tight">
        {t("common:workspace.libraryTabs.guided")}
      </h1>
      {matchesLibraryDifficulty(guidedCourse.difficulty, difficulty) ? (
        <article className={`${panel} space-y-3`}>
          <h2 className="text-lg font-semibold">{t("common:workspace.guidedLesson.title")}</h2>
          <p className="text-sm text-ink-muted">{t("common:workspace.guidedLesson.description")}</p>
          <button
            type="button"
            className={primary}
            disabled={busy}
            onClick={() => prepareCourse(guidedCourse)}
          >
            {t("common:workspace.beginCourse")}
          </button>
        </article>
      ) : (
        <p role="status" className="text-sm text-ink-muted">
          {t("scenarios:noMatchingLessons")}
        </p>
      )}
    </section>
  );
}

export function ListeningPage() {
  const { t } = useTranslation();
  const difficulty = useNavStore((state) => state.libraryDifficulty);
  const options = courses.filter((course) =>
    matchesLibraryDifficulty(course.difficulty, difficulty),
  );
  return (
    <section className="max-w-3xl space-y-5" aria-labelledby="listening-heading">
      <h1 id="listening-heading" className="text-3xl font-semibold tracking-tight">
        {t("common:workspace.libraryTabs.listening")}
      </h1>
      {options.length ? (
        <ListeningExercise key={difficulty} options={options} />
      ) : (
        <p role="status" className="text-sm text-ink-muted">
          {t("scenarios:noMatchingLessons")}
        </p>
      )}
    </section>
  );
}

function ListeningExercise({ options }: { options: ScenarioContent[] }) {
  const { t } = useTranslation();
  const [slug, setSlug] = useState(
    options.includes(guidedCourse) ? guidedCourse.slug : options[0]!.slug,
  );
  const [revealed, setRevealed] = useState(false);
  const course = options.find((item) => item.slug === slug)!;
  const template = course.courseTemplate!;
  const voice = useSpeechLoop(
    slug,
    template.targetLanguage,
    characterVoiceStyle(template.character),
  );
  const navigate = useNavStore((state) => state.navigate);
  const busy = useTrainingStore((state) => state.busy);
  const playing = voice.playback.phase === "loading" || voice.playback.phase === "speaking";
  return (
    <div className={`${panel} space-y-4`}>
      <label className="block text-sm font-semibold">
        {t("training:course")}
        <select
          className="form-control mt-2 block w-full rounded-lg border p-2.5"
          value={slug}
          onChange={(event) => {
            voice.stopPlayback();
            setRevealed(false);
            setSlug(event.target.value);
          }}
        >
          {options.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-ink-muted">{t("common:workspace.listeningInstructions")}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primary}
          disabled={playing || !voice.settings || voice.settings.tts.mode === "off"}
          onClick={() => voice.speak(template.openingLine)}
        >
          {t("common:workspace.playOpening")}
        </button>
        {playing && (
          <button type="button" className={secondary} onClick={voice.stopPlayback}>
            {t("training:stopPlayback")}
          </button>
        )}
        <button
          type="button"
          className={secondary}
          aria-expanded={revealed}
          onClick={() => setRevealed((value) => !value)}
        >
          {revealed ? t("common:workspace.hideTranscript") : t("common:workspace.showTranscript")}
        </button>
      </div>
      {voice.error && (
        <p role="alert">
          <LocalizedError error={voice.error} />
        </p>
      )}
      {voice.playback.error && (
        <p role="alert">
          <LocalizedError error={voice.playback.error} />
        </p>
      )}
      {(!voice.settings || voice.settings.tts.mode === "off" || voice.playback.error) && (
        <button type="button" className="text-sm underline" onClick={() => navigate("settings")}>
          {t("speech:speechSettings")}
        </button>
      )}
      {revealed && (
        <blockquote
          lang={template.targetLanguage}
          className="rounded-lg bg-chat-ai p-4 text-chat-ai-ink"
        >
          {template.openingLine}
        </blockquote>
      )}
      <button
        type="button"
        className={secondary}
        disabled={busy}
        onClick={() => prepareCourse(course)}
      >
        {t("common:workspace.replyInCourse")}
      </button>
    </div>
  );
}

export function ProfilePage() {
  const { t } = useTranslation();
  const { learningMemory, memoryContributions } = useLearningOverview();
  const navigate = useNavStore((state) => state.navigate);
  const profile = learningMemory?.profile;
  const stats = [
    {
      title: "common:workspace.completedCount",
      value: learningMemory?.episodes.filter((item) => item.completed).length ?? 0,
    },
    {
      title: "common:workspace.practiceCount",
      value: memoryContributions.reduce((sum, item) => sum + item.practiceTurns, 0),
    },
    {
      title: "common:workspace.vocabularyCount",
      value: learningMemory?.knowledge.filter((item) => item.practiceTurns > 0).length ?? 0,
    },
  ];
  return (
    <section className="space-y-6" aria-labelledby="profile-heading">
      <h1 id="profile-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {t("common:workspace.sections.profile")}
      </h1>
      <OverviewStatus />
      {profile && (
        <>
          <div className={panel}>
            <h2 className="font-semibold">{t("common:workspace.preferences")}</h2>
            <p className="mt-2 text-lg">
              {profile.targetLanguage} · {profile.level}
            </p>
            {profile.goals.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {profile.goals.map((goal, index) => (
                  <li key={index}>{goal}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className={`${secondary} mt-4`}
              onClick={() => navigate("memory")}
            >
              {t("common:workspace.editPreferences")}
            </button>
          </div>
          <dl className="grid gap-4 sm:grid-cols-3">
            {stats.map(({ title, value }) => (
              <div className={panel} key={title}>
                <dt className="text-sm text-ink-muted">{t(title)}</dt>
                <dd className="mt-2 text-3xl font-semibold text-ink">{formatNumber(value)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
