import { LocalizedError } from "../components/LocalizedError";
import { formatNumber } from "../i18n";
import { useTranslation } from "react-i18next";
import { uiValue } from "../i18n";
import { useEffect, useState } from "react";
import {
  configureScenarioContent,
  getCurrentCourseStage,
  resolveCourseTemplate,
  type ScenarioContent,
  type SpeechInput,
} from "@language-lab/core";
import { CourseStudyPack, CourseReviewPractice } from "../components/CourseStudyPack";
import { LearningReport } from "../components/LearningReport";
import { VocabularyProgress } from "../components/VocabularyProgress";
import { LanguageFeedback } from "../components/LanguageFeedback";
import { VoiceInput } from "../components/VoiceInput";
import { useSpeechLoop } from "../speech/useSpeechLoop";
import { loadScenarioContent } from "../content/scenarioContent";
import { useTrainingStore } from "../stores/training";
import { getGuidedExample, supportsGuidedDemo, type TrainingProvider } from "../training/session";

const courses = loadScenarioContent();
const button =
  "rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40";
const control = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";

function LessonSetup({ course }: { course: ScenarioContent }) {
  const { t } = useTranslation();
  const { start, busy } = useTrainingStore();
  const [mode, setMode] = useState<"demo" | "ai">("demo");
  const [baseUrl, setBaseUrl] = useState("http://localhost:11434/v1");
  const [model, setModel] = useState("llama3.2");
  const [key, setKey] = useState("");
  const [variationId, setVariationId] = useState(
    course.courseTemplate?.selectedVariationId ?? "standard",
  );
  const configured = course.courseTemplate?.learningPack
    ? configureScenarioContent(course, { variationId })
    : course;
  const template = resolveCourseTemplate(configured);
  const selectedMode = supportsGuidedDemo(course) ? mode : "ai";
  return (
    <form
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const provider: TrainingProvider =
          selectedMode === "demo" ? { mode: "demo" } : { mode: "ai", baseUrl, model };
        void start(configured, provider, key).finally(() => setKey(""));
      }}
    >
      <h2 className="font-semibold">
        {course.title} · {course.difficulty}
      </h2>
      <p className="text-sm text-slate-600">
        {t("training:yourRole")}
        {course.courseTemplate?.roles.learner}
      </p>
      {template?.character && (
        <p className="text-sm text-slate-600">
          {t("training:practicePartner")}
          {template.character.name} · {template.character.traits.join(", ")}
        </p>
      )}
      {course.courseTemplate?.learningPack && (
        <>
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
          {template && <CourseStudyPack template={template} />}
        </>
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
        <p className="text-sm text-slate-500">
          {t("training:theGuidedDemoChecksSuggestedExampleRepliesOnlyConnectAI")}
        </p>
      ) : (
        <>
          <label className="block text-sm">
            {t("training:aIEndpoint")}
            <input
              className={control}
              type="url"
              required
              value={baseUrl}
              disabled={busy}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            {t("training:model")}
            <input
              className={control}
              required
              value={model}
              disabled={busy}
              onChange={(event) => setModel(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            {t("training:aPIKeyOptionalForLocalModels")}
            <input
              className={control}
              type="password"
              autoComplete="off"
              value={key}
              disabled={busy}
              onChange={(event) => setKey(event.target.value)}
            />
          </label>
          <p className="text-xs text-slate-500">
            {t("training:useAnOpenAICompatibleEndpointAPIKeysAreSavedIn")}
          </p>
        </>
      )}
      <button className={button} disabled={busy} type="submit">
        {busy ? t("training:starting") : t("training:startLesson")}
      </button>
    </form>
  );
}

export function TrainingPage() {
  const { t } = useTranslation();
  const {
    session,
    sessions,
    pendingCourse,
    loaded,
    busy,
    error,
    load,
    prepare,
    resume,
    send,
    requestSupport,
    finish,
    updateKey,
    saveReviewAnswers,
  } = useTrainingStore();
  const [courseSlug, setCourseSlug] = useState(courses[0]!.slug);
  const [reply, setReply] = useState("");
  const [speechDraft, setSpeechDraft] = useState<{ input: SpeechInput; recognized: string } | null>(
    null,
  );
  const [key, setKey] = useState("");
  const language = session?.state.courseTemplate?.targetLanguage ?? "en";
  const voice = useSpeechLoop(session?.id, language);
  const readSavedReply = (saved: boolean, lessonId: string) => {
    const current = useTrainingStore.getState().session;
    if (saved && current?.id === lessonId) {
      const message = current.messages.at(-1);
      if (message?.role === "assistant") voice.readAfterSave(message.content);
    }
  };
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  useEffect(() => {
    setReply("");
    setSpeechDraft(null);
    setKey("");
  }, [session?.id]);
  const course = pendingCourse ?? courses.find((item) => item.slug === courseSlug)!;
  const stage = session ? getCurrentCourseStage(session.state) : undefined;
  const example = session?.provider.mode === "demo" ? getGuidedExample(session) : undefined;
  const assessment = session?.lastTurn?.assessment;
  const assessmentStage = session?.state.courseTemplate?.stages.find(
    (item) => item.id === assessment?.stageId,
  );
  const challenge = session?.state.courseTemplate?.learningPack?.variations.find(
    (item) => item.id === session.state.courseTemplate?.selectedVariationId,
  );

  return (
    <section aria-label={t("training:training")} className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("training:training")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("training:practiseASceneDemonstrateEachGoalAndReviewYourProgress")}
          </p>
        </div>
        {session && (
          <button type="button" className={button} disabled={busy} onClick={() => prepare()}>
            {t("training:newLesson")}
          </button>
        )}
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <LocalizedError error={error} />
          <p>{t("training:yourLastSavedProgressIsPreservedYouCanRetryThe")}</p>
          {!loaded && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void load()}
              className="mt-2 underline"
            >
              {t("training:retry")}
            </button>
          )}
        </div>
      )}
      {!loaded && !error && <p role="status">{t("training:loadingSavedPractice")}</p>}
      {loaded && (
        <>
          {sessions.length > 0 && (
            <label className="block text-sm">
              {t("training:savedPractice")}
              <select
                className={control}
                disabled={busy}
                value={session?.id ?? ""}
                onChange={(event) => resume(event.target.value)}
              >
                <option value="">{t("training:chooseASavedLesson")}</option>
                {sessions.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.scenario.title} · {t(`common:phases.${item.state.phase}`)} ·{" "}
                    {formatNumber(item.state.turnCount)} {t("training:replies")}{" "}
                    {item.provider.mode === "demo" ? t("training:demo") : t("training:aI")}
                    {item.state.courseTemplate?.learningPack
                      ? t("training:value", {
                          v0: uiValue(
                            item.state.courseTemplate.learningPack.variations.find(
                              (variation) =>
                                variation.id === item.state.courseTemplate?.selectedVariationId,
                            )?.title ?? t("training:standardCheckIn"),
                          ),
                        })
                      : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!session ? (
            <>
              {pendingCourse ? (
                <p className="text-sm text-slate-600">
                  {t("training:usingYourConfiguredCourseTemplate")}
                </p>
              ) : (
                <label className="block text-sm">
                  {t("training:course")}
                  <select
                    className={control}
                    disabled={busy}
                    value={courseSlug}
                    onChange={(event) => setCourseSlug(event.target.value)}
                  >
                    {courses.map((item) => (
                      <option value={item.slug} key={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <LessonSetup key={JSON.stringify(course)} course={course} />
            </>
          ) : (
            <>
              <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-5">
                <h2 className="font-semibold">
                  {session.scenario.title} · {session.state.difficulty}
                </h2>
                {challenge && (
                  <p className="text-sm text-slate-600">
                    {t("training:practiceChallenge")}
                    {challenge.title}
                  </p>
                )}
                <p className="text-sm text-slate-500">
                  {session.provider.mode === "demo"
                    ? t("training:guidedDemoSuggestedRepliesOnly")
                    : t("training:connectedAIValue", { v0: uiValue(session.provider.model) })}
                </p>
                <p className="text-sm font-medium">
                  {stage
                    ? t("training:currentStepValue", { v0: uiValue(stage.title) })
                    : t("training:allLessonObjectivesDemonstrated")}
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
              </div>
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
              <section aria-label={t("training:speechPlayback")} className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-slate-300 bg-white px-3 py-2 disabled:opacity-40"
                    disabled={
                      busy ||
                      voice.capturing ||
                      !voice.settings ||
                      voice.settings.tts.mode === "off"
                    }
                    onClick={() =>
                      voice.speak(
                        [...session.messages]
                          .reverse()
                          .find((message) => message.role === "assistant")?.content ?? "",
                      )
                    }
                  >
                    {t("training:readLatestPartnerReply")}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-slate-300 bg-white px-3 py-2 disabled:opacity-40"
                    disabled={!["loading", "speaking"].includes(voice.playback.phase)}
                    onClick={voice.stopPlayback}
                  >
                    {t("training:stopPlayback")}
                  </button>
                </div>
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
              </section>
              <ol aria-label={t("training:conversation")} className="space-y-3">
                {session.messages.map((message) => (
                  <li
                    key={formatNumber(message.seq)}
                    className={`max-w-[90%] rounded-lg p-4 text-sm ${message.role === "user" ? "ml-auto bg-slate-900 text-white" : "border border-slate-200 bg-white"}`}
                  >
                    <p className="mb-1 text-xs font-medium">
                      {message.role === "user"
                        ? message.purpose === "support"
                          ? t("training:youHelpRequest")
                          : message.speech
                            ? t("training:youSpeechTranscriptValue", {
                                v0: uiValue(
                                  message.speech.edited
                                    ? t("training:edited")
                                    : t("training:reviewed"),
                                ),
                              })
                            : t("training:you")
                        : (session.state.courseTemplate?.character?.name ??
                          t("training:practicePartner2"))}
                    </p>
                    <p className="whitespace-pre-wrap">{message.content}</p>
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
                  className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm"
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
                          <blockquote
                            key={index}
                            className="ml-4 border-l-2 border-emerald-300 pl-2"
                          >
                            “{citation.quote}”
                          </blockquote>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(session.state.phase === "briefing" || session.state.phase === "practice") && (
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    voice.stopPlayback();
                    void send(
                      reply,
                      speechDraft
                        ? {
                            ...speechDraft.input,
                            edited:
                              speechDraft.input.edited || reply.trim() !== speechDraft.recognized,
                          }
                        : undefined,
                    ).then((saved) => {
                      if (saved) {
                        setReply("");
                        setSpeechDraft(null);
                        voice.cancel();
                      }
                      readSavedReply(saved, session.id);
                    });
                  }}
                >
                  <div
                    role="group"
                    aria-label={t("training:practiceHelp")}
                    className="space-y-2 text-sm"
                  >
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded border border-slate-300 bg-white px-3 py-2 disabled:opacity-40"
                        disabled={busy || voice.capturing}
                        onClick={() => {
                          voice.stopPlayback();
                          void requestSupport("repeat").then((saved) =>
                            readSavedReply(saved, session.id),
                          );
                        }}
                      >
                        {t("training:repeatLastReply")}
                      </button>
                      {session.provider.mode === "ai" && (
                        <button
                          type="button"
                          className="rounded border border-slate-300 bg-white px-3 py-2 disabled:opacity-40"
                          disabled={busy || voice.capturing}
                          onClick={() => {
                            voice.stopPlayback();
                            void requestSupport("simplify").then((saved) =>
                              readSavedReply(saved, session.id),
                            );
                          }}
                        >
                          {t("training:useSimplerEnglish")}
                        </button>
                      )}
                      <button
                        type="button"
                        className="rounded border border-slate-300 bg-white px-3 py-2 disabled:opacity-40"
                        disabled={
                          busy ||
                          voice.capturing ||
                          session.state.hintsGiven >=
                            (session.state.courseTemplate?.teachingPolicy.maxHints ?? 3)
                        }
                        onClick={() => {
                          voice.stopPlayback();
                          void requestSupport("hint").then((saved) =>
                            readSavedReply(saved, session.id),
                          );
                        }}
                      >
                        {t("training:giveMeAHint")}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">
                      {t("training:hintsUsed")}
                      {formatNumber(session.state.hintsGiven)}/
                      {session.state.courseTemplate?.teachingPolicy.maxHints ?? 3}
                      {t("training:helpRequestsDoNotCompleteObjectives")}
                    </p>
                  </div>
                  {example && (
                    <div className="rounded-lg bg-slate-50 p-3 text-sm">
                      <p>
                        {t("training:suggestedReply")}
                        {example}
                      </p>
                      <button
                        type="button"
                        disabled={busy || voice.capturing}
                        className="mt-2 font-medium underline"
                        onClick={() => {
                          setReply(example);
                          setSpeechDraft(null);
                        }}
                      >
                        {t("training:useSuggestedReply")}
                      </button>
                    </div>
                  )}
                  <label className="block text-sm">
                    {t("training:yourReply")}
                    <textarea
                      className={control}
                      rows={3}
                      maxLength={4000}
                      value={reply}
                      disabled={busy || voice.capturing}
                      onChange={(event) => {
                        setReply(event.target.value);
                        if (!event.target.value.trim()) setSpeechDraft(null);
                      }}
                    />
                  </label>
                  <VoiceInput
                    voice={voice}
                    busy={busy}
                    hasDraft={!!reply.trim()}
                    remainingCharacters={4000 - (reply.trim() ? reply.length + 1 : 0)}
                    language={language}
                    onUse={(text, recognized, input) => {
                      setReply((previous) => (previous.trim() ? `${previous}\n${text}` : text));
                      setSpeechDraft({ input, recognized });
                    }}
                  />
                  <button
                    type="submit"
                    className={button}
                    disabled={busy || voice.capturing || !reply.trim()}
                  >
                    {busy ? t("training:respondingAndSaving") : t("training:sendReply")}
                  </button>
                </form>
              )}
              {session.state.phase === "debrief" && (
                <button
                  type="button"
                  className={button}
                  disabled={busy}
                  onClick={() => void finish()}
                >
                  {busy ? t("training:preparingReview") : t("training:finishAndReview")}
                </button>
              )}
              {session.report && <LearningReport session={session} />}
              {session.provider.mode === "ai" && (
                <details className="text-sm">
                  <summary className="cursor-pointer">{t("training:updateConnectionKey")}</summary>
                  <form
                    className="mt-3 space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void updateKey(key).finally(() => setKey(""));
                    }}
                  >
                    <label>
                      {t("training:aPIKey")}
                      <input
                        className={control}
                        type="password"
                        autoComplete="off"
                        value={key}
                        onChange={(event) => setKey(event.target.value)}
                      />
                    </label>
                    <button type="submit" className={button} disabled={busy || !key.trim()}>
                      {t("training:saveAPIKey")}
                    </button>
                  </form>
                </details>
              )}
              {session.report && session.state.courseTemplate?.learningPack && (
                <CourseReviewPractice
                  key={session.id}
                  session={session}
                  busy={busy}
                  onSave={saveReviewAnswers}
                />
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
