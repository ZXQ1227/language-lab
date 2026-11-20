import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { detectDialogueSupport, getCurrentCourseStage } from "@language-lab/core";
import { formatNumber } from "../i18n";
import { useNavStore } from "../stores/nav";
import { useTrainingStore } from "../stores/training";
import { useSpeechLoop } from "../speech/useSpeechLoop";
import { characterVoiceStyle } from "../speech/voices";
import { isTrainingUnfinished, trainingTurnLimit, type TrainingSession } from "../training/session";
import { CourseStudyPack, CourseReviewPractice } from "./CourseStudyPack";
import { TrainingMessageFeedback } from "./LanguageFeedback";
import { LearningReport } from "./LearningReport";
import { LessonComposer } from "./LessonComposer";
import { LocalizedError } from "./LocalizedError";
import { PartnerMessageActions } from "./PartnerMessageActions";
import { SavedPracticePicker } from "./SavedPracticePicker";
import { VocabularyProgress } from "./VocabularyProgress";

const action =
  "button-secondary rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50";
const zoiAvatar = new URL("../assets/zoi-avatar.webp", import.meta.url).href;

export function LessonConversation({ session }: { session: TrainingSession }) {
  const { t } = useTranslation();
  const { busy, error, turnStatus, prepare, finish, endEarly, saveReviewAnswers } =
    useTrainingStore();
  const navigate = useNavStore((state) => state.navigate);
  const trainingReturnPage = useNavStore((state) => state.trainingReturnPage);
  const language = session.state.courseTemplate?.targetLanguage ?? "en";
  const character = session.state.courseTemplate?.character;
  const voice = useSpeechLoop(session.id, language, characterVoiceStyle(character));
  const stage = getCurrentCourseStage(session.state);
  const assessment = session.lastTurn?.assessment;
  const stagePassed = assessment?.criteria.every((criterion) => criterion.met);
  const assessmentStage = session.state.courseTemplate?.stages.find(
    (item) => item.id === assessment?.stageId,
  );
  const challenge = session.state.courseTemplate?.learningPack?.variations.find(
    (item) => item.id === session.state.courseTemplate?.selectedVariationId,
  );
  const phase = session.state.phase;
  const unfinished = isTrainingUnfinished(session);
  const immersive = phase !== "done" && !unfinished;
  const partner = character?.name ?? t("training:defaultPartnerName");
  const completed = session.state.objectives.filter((objective) => objective.completed).length;
  const total = session.state.objectives.length;
  const latest = [...session.messages].reverse().find((message) => message.role === "assistant");
  const diagnoses = new Map(session.diagnoses?.map((record) => [record.messageSeq, record]));
  const policy = session.state.courseTemplate?.teachingPolicy;
  const readDisabled =
    busy || voice.capturing || !voice.settings || voice.settings.tts.mode === "off";
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

  const composing = !unfinished && (phase === "briefing" || phase === "practice");
  const lessonDetails = (
    <details className="text-sm">
      <summary className="button-secondary w-fit cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold">
        {t("training:focus.details")}
      </summary>
      <div
        className={`max-h-[34dvh] space-y-3 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-4 ${composing ? "absolute inset-x-3 bottom-full z-10 mx-auto mb-2 max-w-4xl shadow-lg" : "mt-2"}`}
      >
        <p className="text-sm text-ink-muted">
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
            className="list-disc pl-5 text-sm text-ink-muted"
          >
            {stage.successCriteria.map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        )}
        {session.state.courseTemplate?.learningPack && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-ink">
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
  );

  return (
    <section
      aria-label={t("training:training")}
      className={immersive ? "flex min-h-0 flex-1 flex-col bg-app" : "mx-auto max-w-3xl space-y-4"}
    >
      <header className="shrink-0 border-b border-line bg-surface">
        <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6 sm:py-4">
          <h1 className="sr-only">{t("training:training")}</h1>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 grow">
              <h2 className="break-words text-lg font-semibold tracking-tight text-ink sm:text-xl">
                {session.scenario.title} · {session.state.difficulty}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                {stage
                  ? t("training:currentStepValue", { v0: stage.title })
                  : t("training:allLessonObjectivesDemonstrated")}
              </p>
            </div>
            <button
              type="button"
              className={action}
              disabled={busy}
              onClick={() => navigate(trainingReturnPage)}
            >
              {t("training:focus.exit")}
            </button>
            {composing && session.state.turnCount > 0 && (
              <button
                type="button"
                className={action}
                disabled={busy || voice.capturing}
                onClick={() => void endEarly()}
              >
                {t("training:unfinished.end")}
              </button>
            )}
            <button type="button" className={action} disabled={busy} onClick={() => prepare()}>
              {t("training:newLesson")}
            </button>
          </div>
          {challenge && (
            <p className="mt-1 text-xs text-ink-muted">
              {t("training:practiceChallenge")}
              {challenge.title}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {total > 0 && (
              <label className="flex min-w-[min(100%,13rem)] flex-1 items-center gap-3 text-xs font-medium text-ink-muted">
                <progress className="h-1.5 min-w-8 flex-1" value={completed} max={total} />
                <span>
                  {t("training:focus.goalProgress", {
                    completed: formatNumber(completed),
                    total: formatNumber(total),
                  })}
                </span>
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
                  <p role="alert" className="text-error-ink">
                    <LocalizedError error={voice.playback.error} />{" "}
                    {t("training:yourSavedLessonIsUnchangedRetryTheReadButton")}
                  </p>
                )}
              </div>
            </section>
          </div>
          {!composing && <div className="mt-2">{lessonDetails}</div>}
          {error && (
            <div
              role="alert"
              className="mt-2 max-h-[16dvh] overflow-y-auto rounded-lg border border-error-line bg-chat-error p-3 text-sm text-error-ink"
            >
              <LocalizedError error={error} />
              <p>
                {turnStatus === "replyFailed" || turnStatus === "saveFailed"
                  ? t(`training:turnStatus.${turnStatus}`)
                  : t("training:yourLastSavedProgressIsPreservedYouCanRetryThe")}
              </p>
            </div>
          )}
        </div>
      </header>
      {unfinished && (
        <section
          aria-labelledby="unfinished-heading"
          className="space-y-3 rounded-xl border border-line bg-surface p-4"
        >
          <h3 id="unfinished-heading" className="font-semibold">
            {t("training:unfinished.title")}
          </h3>
          <p className="text-sm text-ink-muted">
            {session.state.turnCount >= trainingTurnLimit
              ? t("training:unfinished.turnLimit", { count: trainingTurnLimit })
              : t("training:unfinished.ended")}
          </p>
          <ul className="space-y-2 text-sm">
            {session.state.courseTemplate?.stages.map((item) => (
              <li key={item.id}>
                <p className="font-medium">{item.title}</p>
                <ul className="pl-4">
                  {item.successCriteria.map((criterion, index) => {
                    const verified = session.state.stageAssessments?.[item.id]?.criteria.find(
                      (entry) => entry.criterionIndex === index && entry.met,
                    );
                    return (
                      <li key={index}>
                        {verified ? "✓" : "○"} {criterion}
                        {verified?.evidence.map((citation, citationIndex) => (
                          <blockquote
                            key={citationIndex}
                            className="ml-4 border-l-2 border-line-strong pl-2"
                          >
                            “{citation.quote}”
                          </blockquote>
                        ))}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
          <button type="button" className={action} onClick={() => prepare(session.scenario)}>
            {t("training:unfinished.retry")}
          </button>
        </section>
      )}
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
          immersive ? "min-h-0 flex-1 overflow-y-auto overscroll-contain" : "rounded-xl bg-app"
        }
        onScroll={(event) => {
          const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
          follow.current = scrollHeight - scrollTop - clientHeight < 64;
        }}
      >
        <div className="mx-auto max-w-4xl space-y-5 px-4 py-5 sm:space-y-6 sm:px-6 sm:py-7">
          <div
            role="group"
            aria-label={t("course:practicePartner")}
            className="flex w-fit max-w-full items-center gap-4 rounded-3xl border border-line-info bg-brand-primary-subtle p-3.5 pr-5 sm:gap-5 sm:p-4 sm:pr-6"
          >
            {character ? (
              <span
                aria-hidden="true"
                className="teacher-avatar grid size-14 shrink-0 place-items-center rounded-full text-xl font-semibold uppercase sm:size-16"
              >
                {Array.from(partner)[0]}
              </span>
            ) : (
              <img
                src={zoiAvatar}
                alt=""
                width={64}
                height={64}
                className="teacher-avatar size-14 shrink-0 rounded-full object-cover sm:size-16"
              />
            )}
            <div className="min-w-0">
              <p className="break-words font-semibold text-ink">{partner}</p>
              {session.state.courseTemplate?.roles.partner && (
                <p
                  lang={language}
                  className="mt-0.5 max-w-48 break-words text-xs leading-relaxed text-ink-muted"
                >
                  {session.state.courseTemplate.roles.partner}
                </p>
              )}
            </div>
          </div>
          <ol aria-label={t("training:conversation")} className="space-y-4 sm:space-y-5">
            {session.messages.map((message, index) => {
              const diagnosis = diagnoses.get(message.seq);
              const previous = session.messages[index - 1];
              const hint =
                message.role === "assistant" &&
                message.purpose === "support" &&
                previous?.role === "user" &&
                detectDialogueSupport(previous.content) === "hint";
              const bubble =
                message.role === "user"
                  ? "ml-auto rounded-tr-md bg-chat-user text-on-brand"
                  : hint
                    ? "rounded-tl-md bg-chat-hint text-hint-ink"
                    : "rounded-tl-md bg-chat-ai text-chat-ai-ink";
              return (
                <li
                  key={message.seq}
                  className={`w-fit max-w-[92%] rounded-3xl px-4 py-3 sm:max-w-[78%] sm:px-5 sm:py-4 ${bubble}`}
                >
                  <p className="mb-1.5 text-xs font-semibold">
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
                      : hint
                        ? `${partner} · ${t("training:focus.hint")}`
                        : partner}
                  </p>
                  <p
                    lang={language}
                    className="whitespace-pre-wrap break-words text-base leading-relaxed sm:text-lg"
                  >
                    {message.content}
                  </p>
                  {message.role === "assistant" && (
                    <PartnerMessageActions
                      text={message.content}
                      language={language}
                      messageNumber={index + 1}
                      readDisabled={readDisabled}
                      onRead={() => voice.speak(message.content)}
                    />
                  )}
                  {diagnosis && (
                    <TrainingMessageFeedback
                      record={diagnosis}
                      text={message.content}
                      language={language}
                      readDisabled={readDisabled}
                      onRead={voice.speak}
                      legacyReason={
                        policy?.correctionMode === "off"
                          ? "corrections_off"
                          : policy &&
                              diagnosis.diagnosis.errors.length > 0 &&
                              session.state.correctionsGiven >= policy.maxCorrections
                            ? "budget_exhausted"
                            : undefined
                      }
                    />
                  )}
                </li>
              );
            })}
          </ol>

          {session.lastTurn?.evidenceStatus && (
            <div
              aria-label={t("training:learningFeedback")}
              className="rounded-xl border border-line bg-surface p-4 text-sm"
            >
              <p>{t(`training:turnEvidence.${session.lastTurn.evidenceStatus}`)}</p>
              {session.provider.mode === "demo" && <p>{t("training:turnEvidence.demo")}</p>}
            </div>
          )}
          {!session.diagnoses &&
            session.lastTurn?.action === "light_correction" &&
            session.lastTurn.errors[0] && (
              <div
                aria-label={t("training:correction")}
                className="rounded-lg border border-error-line bg-chat-error p-4 text-sm text-error-ink"
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
              className={`space-y-2 rounded-xl border p-4 text-sm ${stagePassed ? "border-success-line bg-chat-success text-success-ink" : "border-warning-line bg-chat-hint text-hint-ink"}`}
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
                      <blockquote key={index} className="ml-4 border-l-2 border-current/30 pl-2">
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
      {composing && (
        <LessonComposer
          session={session}
          voice={voice}
          lessonDetails={lessonDetails}
          onSaved={(saved) => readSavedReply(saved, session.id)}
        />
      )}
      {phase === "debrief" && (
        <div className="shrink-0 border-t border-line bg-surface px-3 py-3">
          <div className="mx-auto flex max-w-4xl justify-end">
            <button
              type="button"
              className="rounded-xl button-primary px-4 py-2.5 font-semibold disabled:opacity-50"
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
