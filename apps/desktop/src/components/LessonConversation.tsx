import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentCourseStage } from "@language-lab/core";
import { formatNumber } from "../i18n";
import { useNavStore } from "../stores/nav";
import { useTrainingStore } from "../stores/training";
import { useSpeechLoop } from "../speech/useSpeechLoop";
import { characterVoiceStyle } from "../speech/voices";
import type { TrainingSession } from "../training/session";
import { CourseStudyPack, CourseReviewPractice } from "./CourseStudyPack";
import { LanguageFeedback } from "./LanguageFeedback";
import { LearningReport } from "./LearningReport";
import { LessonComposer } from "./LessonComposer";
import { LocalizedError } from "./LocalizedError";
import { SavedPracticePicker } from "./SavedPracticePicker";
import { VocabularyProgress } from "./VocabularyProgress";

const action =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-50 disabled:opacity-50";
const zoiAvatar = new URL("../assets/zoi-avatar.webp", import.meta.url).href;

export function LessonConversation({ session }: { session: TrainingSession }) {
  const { t } = useTranslation();
  const { busy, error, prepare, finish, saveReviewAnswers } = useTrainingStore();
  const navigate = useNavStore((state) => state.navigate);
  const language = session.state.courseTemplate?.targetLanguage ?? "en";
  const character = session.state.courseTemplate?.character;
  const voice = useSpeechLoop(session.id, language, characterVoiceStyle(character));
  const stage = getCurrentCourseStage(session.state);
  const assessment = session.lastTurn?.assessment;
  const assessmentStage = session.state.courseTemplate?.stages.find(
    (item) => item.id === assessment?.stageId,
  );
  const challenge = session.state.courseTemplate?.learningPack?.variations.find(
    (item) => item.id === session.state.courseTemplate?.selectedVariationId,
  );
  const phase = session.state.phase;
  const immersive = phase !== "done";
  const partner = character?.name ?? t("training:defaultPartnerName");
  const completed = session.state.objectives.filter((objective) => objective.completed).length;
  const total = session.state.objectives.length;
  const latest = [...session.messages].reverse().find((message) => message.role === "assistant");
  const transcript = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useLayoutEffect(() => {
    const viewport = transcript.current;
    if (immersive && viewport && follow.current) viewport.scrollTop = viewport.scrollHeight;
  }, [immersive, session.messages.length]);
  useEffect(() => {
    const viewport = transcript.current;
    if (!immersive || !viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (follow.current) viewport.scrollTop = viewport.scrollHeight;
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [immersive]);
  const readSavedReply = (saved: boolean, lessonId: string) => {
    const current = useTrainingStore.getState().session;
    if (saved && current?.id === lessonId) {
      const message = current.messages.at(-1);
      if (message?.role === "assistant") voice.readAfterSave(message.content);
    }
  };

  return (
    <section
      aria-label={t("training:training")}
      className={
        immersive ? "flex min-h-0 flex-1 flex-col bg-[#f0f4ee]" : "mx-auto max-w-3xl space-y-4"
      }
    >
      <header className="shrink-0 border-b border-emerald-950/10 bg-white">
        <div className="mx-auto max-w-3xl px-3 py-3 sm:px-6 sm:py-4">
          <h1 className="sr-only">{t("training:training")}</h1>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 grow">
              <h2 className="break-words text-lg font-semibold tracking-tight text-emerald-950 sm:text-xl">
                {session.scenario.title} · {session.state.difficulty}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {stage
                  ? t("training:currentStepValue", { v0: stage.title })
                  : t("training:allLessonObjectivesDemonstrated")}
              </p>
            </div>
            <button
              type="button"
              className={action}
              disabled={busy}
              onClick={() => navigate("conversation")}
            >
              {t("training:focus.exit")}
            </button>
            <button type="button" className={action} disabled={busy} onClick={() => prepare()}>
              {t("training:newLesson")}
            </button>
          </div>
          {challenge && (
            <p className="mt-1 text-xs text-slate-600">
              {t("training:practiceChallenge")}
              {challenge.title}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            {total > 0 && (
              <label className="inline-flex flex-wrap items-center gap-2 text-xs font-medium text-emerald-950">
                {t("training:focus.goalProgress", {
                  completed: formatNumber(completed),
                  total: formatNumber(total),
                })}
                <progress
                  className="h-1.5 w-20 accent-emerald-800 sm:w-28"
                  value={completed}
                  max={total}
                />
              </label>
            )}
            <section
              aria-label={t("training:speechPlayback")}
              className="flex flex-wrap items-center gap-2 text-xs"
            >
              <button
                type="button"
                className={action}
                disabled={
                  !latest ||
                  busy ||
                  voice.capturing ||
                  !voice.settings ||
                  voice.settings.tts.mode === "off"
                }
                onClick={() => latest && voice.speak(latest.content)}
              >
                {t("training:readLatestPartnerReply")}
              </button>
              {voice.playback.phase !== "idle" && voice.playback.phase !== "error" && (
                <button type="button" className={action} onClick={voice.stopPlayback}>
                  {t("training:stopPlayback")}
                </button>
              )}
              <div className="basis-full space-y-1 text-xs empty:hidden">
                {voice.playback.phase === "loading" && (
                  <p role="status">{t("training:preparingSpeech")}</p>
                )}
                {voice.playback.phase === "speaking" && (
                  <p role="status">{t("training:readingPartnerReply")}</p>
                )}
                {voice.playback.error && (
                  <p role="alert" className="text-red-700">
                    <LocalizedError error={voice.playback.error} />{" "}
                    {t("training:yourSavedLessonIsUnchangedRetryTheReadButton")}
                  </p>
                )}
              </div>
            </section>
          </div>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer py-1 text-xs font-semibold text-emerald-950">
              {t("training:focus.details")}
            </summary>
            <div className="mt-2 max-h-[34dvh] space-y-3 overflow-y-auto overscroll-contain rounded-lg border border-stone-200 p-3">
              <p className="text-sm text-slate-600">
                {session.provider.mode === "demo"
                  ? t("training:guidedDemoSuggestedRepliesOnly")
                  : t("training:connectedAIValue", { v0: session.provider.model })}
              </p>
              <ul className="space-y-1 text-sm">
                {session.state.objectives.map((objective) => (
                  <li key={objective.id}>
                    {objective.completed ? "✓" : "○"} {objective.description}
                  </li>
                ))}
              </ul>
              {stage && (
                <ul
                  aria-label={t("training:currentSuccessCriteria")}
                  className="list-disc pl-5 text-sm text-slate-600"
                >
                  {stage.successCriteria.map((criterion) => (
                    <li key={criterion}>{criterion}</li>
                  ))}
                </ul>
              )}
              {session.state.courseTemplate?.learningPack && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-slate-700">
                    {t("training:lessonReference")}
                  </summary>
                  <div className="mt-3">
                    <CourseStudyPack template={session.state.courseTemplate} />
                  </div>
                </details>
              )}
              <VocabularyProgress session={session} />

              <SavedPracticePicker />
            </div>
          </details>
          {error && (
            <div
              role="alert"
              className="mt-2 max-h-[16dvh] overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              <LocalizedError error={error} />
              <p>{t("training:yourLastSavedProgressIsPreservedYouCanRetryThe")}</p>
            </div>
          )}
        </div>
      </header>
      {session.report && (
        <>
          <LearningReport session={session} />
          {session.state.courseTemplate?.learningPack && (
            <CourseReviewPractice session={session} busy={busy} onSave={saveReviewAnswers} />
          )}
        </>
      )}
      <div
        ref={transcript}
        className={
          immersive
            ? "min-h-0 flex-1 overflow-y-auto overscroll-contain"
            : "rounded-xl bg-[#f0f4ee]"
        }
        onScroll={(event) => {
          const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
          follow.current = scrollHeight - scrollTop - clientHeight < 64;
        }}
      >
        <div className="mx-auto max-w-3xl space-y-4 px-3 py-4 sm:px-6 sm:py-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
            {character ? (
              <span
                aria-hidden="true"
                className="grid size-8 place-items-center rounded-lg bg-[#dceac8] uppercase"
              >
                {Array.from(partner)[0]}
              </span>
            ) : (
              <img
                src={zoiAvatar}
                alt=""
                width={48}
                height={48}
                className="size-12 shrink-0 rounded-xl border border-emerald-950/10 bg-[#e5eddd] object-cover"
              />
            )}
            <span>{partner}</span>
          </div>
          <ol aria-label={t("training:conversation")} className="space-y-3">
            {session.messages.map((message) => (
              <li
                key={message.seq}
                className={`w-fit max-w-[92%] rounded-2xl px-4 py-3 shadow-xs sm:max-w-[78%] sm:px-5 ${message.role === "user" ? "ml-auto rounded-br-sm bg-[#17453d] text-white" : "rounded-bl-sm border border-emerald-950/10 bg-white text-emerald-950"}`}
              >
                <p className="mb-1 text-xs font-semibold opacity-80">
                  {message.role === "user"
                    ? message.purpose === "support"
                      ? t("training:youHelpRequest")
                      : message.speech
                        ? t("training:youSpeechTranscriptValue", {
                            v0: message.speech.edited
                              ? t("training:edited")
                              : t("training:reviewed"),
                          })
                        : t("training:you")
                    : partner}
                </p>
                <p lang={language} className="whitespace-pre-wrap break-words leading-relaxed">
                  {message.content}
                </p>
                {message.role === "assistant" && (
                  <button
                    type="button"
                    className="mt-2 text-xs underline disabled:opacity-40"
                    disabled={
                      busy ||
                      voice.capturing ||
                      !voice.settings ||
                      voice.settings.tts.mode === "off"
                    }
                    onClick={() => voice.speak(message.content)}
                  >
                    {t("training:readMessage")}
                    {formatNumber(message.seq)}
                  </button>
                )}
              </li>
            ))}
          </ol>

          <LanguageFeedback session={session} />
          {!session.diagnoses &&
            session.lastTurn?.action === "light_correction" &&
            session.lastTurn.errors[0] && (
              <div
                aria-label={t("training:correction")}
                className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm"
              >
                <p className="font-medium">{t("training:aSmallCorrection")}</p>
                <p>
                  {session.lastTurn.errors[0].original} → {session.lastTurn.errors[0].corrected}
                </p>
                <p>{session.lastTurn.errors[0].explanation}</p>
              </div>
            )}
          {assessment && (
            <div
              aria-label={t("training:learningFeedback")}
              className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm"
            >
              <h3 className="font-medium">
                {t("training:feedback")}
                {assessmentStage?.title}
              </h3>
              <p>{assessment.feedback}</p>
              <ul>
                {assessment.criteria.map((criterion) => (
                  <li className="mt-2" key={criterion.criterionIndex}>
                    <p>
                      {criterion.met ? "✓" : "○"}{" "}
                      {assessmentStage?.successCriteria[criterion.criterionIndex]}
                    </p>
                    {criterion.evidence.map((citation, index) => (
                      <blockquote key={index} className="ml-4 border-l-2 border-emerald-300 pl-2">
                        “{citation.quote}”
                      </blockquote>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      {(phase === "briefing" || phase === "practice") && (
        <LessonComposer
          session={session}
          voice={voice}
          onSaved={(saved) => readSavedReply(saved, session.id)}
        />
      )}
      {phase === "debrief" && (
        <div className="shrink-0 border-t border-emerald-950/10 bg-white px-3 py-3">
          <div className="mx-auto flex max-w-3xl justify-end">
            <button
              type="button"
              className="rounded-xl bg-emerald-900 px-4 py-2.5 font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={() => void finish()}
            >
              {busy ? t("training:preparingReview") : t("training:finishAndReview")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
