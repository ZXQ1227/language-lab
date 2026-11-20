import { LocalizedError } from "../components/LocalizedError";
import { formatDateTime, formatNumber } from "../i18n";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { profileMemorySchema, type LearningProfile } from "@language-lab/memory";
import { useTrainingStore } from "../stores/training";
import { useNavStore } from "../stores/nav";

const control = "mt-1 block w-full rounded border form-control p-2 text-sm";
const button = "rounded button-primary px-3 py-2 text-sm disabled:opacity-40";

function ProfileEditor({ profile, saved }: { profile: LearningProfile; saved: boolean }) {
  const { t } = useTranslation();
  const { busy, saveProfile } = useTrainingStore();
  const [language, setLanguage] = useState(profile.targetLanguage);
  const [level, setLevel] = useState(profile.level);
  const [goals, setGoals] = useState(profile.goals.join("\n"));
  const [error, setError] = useState<string | null>(null);
  const dirty =
    language !== profile.targetLanguage ||
    level !== profile.level ||
    goals !== profile.goals.join("\n");
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = profileMemorySchema.safeParse({
          targetLanguage: language,
          level,
          goals: goals
            .split("\n")
            .map((goal) => goal.trim())
            .filter(Boolean),
        });
        if (!parsed.success) {
          setError("common:errors.profileFields");
          return;
        }
        setError(null);
        void saveProfile(parsed.data).then((saved) => {
          if (saved) {
            setLanguage(parsed.data.targetLanguage);
            setLevel(parsed.data.level);
            setGoals(parsed.data.goals.join("\n"));
          }
        });
      }}
    >
      <p className="text-sm text-ink-muted">
        {dirty
          ? t("memory:unsavedProfileChanges")
          : saved
            ? t("memory:yourStatedProfileIsSavedOnThisDevice")
            : t("memory:noProfileSavedYetDefaultsAreNotAnAssessment")}{" "}
        {t("memory:practiceNeverChangesYourStatedLevelAutomatically")}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {t("memory:targetLanguageCode")}
          <input
            className={control}
            maxLength={35}
            required
            value={language}
            disabled={busy}
            onChange={(event) => setLanguage(event.target.value)}
          />
        </label>
        <label className="text-sm">
          {t("memory:yourStatedLevel")}
          <select
            className={control}
            value={level}
            disabled={busy}
            onChange={(event) =>
              setLevel(profileMemorySchema.shape.level.parse(event.target.value))
            }
          >
            {profileMemorySchema.shape.level.options.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        {t("memory:learningGoalsOnePerLine")}
        <textarea
          className={control}
          rows={3}
          maxLength={2100}
          value={goals}
          disabled={busy}
          onChange={(event) => setGoals(event.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-error-ink">
          <LocalizedError error={error} />
        </p>
      )}
      <button type="submit" className={button} disabled={busy}>
        {t("memory:saveProfile")}
      </button>
    </form>
  );
}

export function LearningMemoryPage({
  view = "all",
}: {
  view?: "all" | "vocabulary" | "corrections";
}) {
  const { t } = useTranslation();
  const title = view === "all" ? t("memory:learningMemory") : t(`common:workspace.pages.${view}`);
  const {
    learningMemory: memory,
    loaded,
    busy,
    error,
    load,
    openLesson,
    reuseAcrossSessions,
    setMemoryReuse,
    deletePracticeSource,
  } = useTrainingStore();
  const navigate = useNavStore((state) => state.navigate);
  const openFreeConversation = useNavStore((state) => state.openFreeConversation);
  const [language, setLanguage] = useState("");
  const [limit, setLimit] = useState(20);
  const [deleting, setDeleting] = useState<string | null>(null);
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  const sourceButton = (id: string, source?: "free-conversation") => (
    <button
      type="button"
      className="text-xs font-medium underline disabled:opacity-40"
      disabled={busy}
      onClick={() => {
        if (source === "free-conversation") {
          openFreeConversation(id);
          return;
        }
        void openLesson(id).then((opened) => {
          if (opened) navigate("training");
        });
      }}
    >
      {t(
        source === "free-conversation"
          ? "memory:openSourceConversation"
          : "memory:openSourceLesson",
      )}
    </button>
  );
  const matching = (item: { language: string }) =>
    !language || item.language.toLowerCase() === language.toLowerCase();
  const knowledge = memory?.knowledge.filter(matching) ?? [];
  const errors = memory?.errors.filter(matching) ?? [];
  const episodes = memory?.episodes.filter(matching) ?? [];
  const languages = [
    ...new Set([
      ...(memory?.knowledge.map((item) => item.language) ?? []),
      ...(memory?.episodes.map((item) => item.language) ?? []),
    ]),
  ].sort();
  return (
    <section aria-label={title} className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {view === "all" && (
            <p className="mt-1 text-sm text-ink-muted">
              {t("memory:yourProfileVocabularyObservationsLanguageIssuesAndPracticeHistoryAcross")}
            </p>
          )}
        </div>
        <button type="button" className={button} disabled={busy} onClick={() => void load()}>
          {t("memory:refreshMemory")}
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded border border-error-line bg-chat-error p-4 text-sm text-error-ink"
        >
          <LocalizedError error={error} />
          <button
            type="button"
            className="ml-3 underline"
            disabled={busy}
            onClick={() => void load()}
          >
            {t("memory:retryMemoryLoad")}
          </button>
        </div>
      )}
      {!memory && !error && <p role="status">{t("memory:loadingLearningMemory")}</p>}
      {memory && (
        <>
          {view === "all" && (
            <section
              aria-label={t("memory:profileMemory")}
              className="space-y-3 rounded border border-line bg-surface p-5"
            >
              <h2 className="font-semibold">{t("memory:profileMemory")}</h2>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={reuseAcrossSessions === true}
                  disabled={busy || reuseAcrossSessions === null}
                  aria-describedby="memory-reuse-description"
                  onChange={(event) => void setMemoryReuse(event.target.checked)}
                />
                {t("memory:controls.reuse")}
              </label>
              <p id="memory-reuse-description" className="text-sm text-ink-muted">
                {t("memory:controls.reuseDescription")}
              </p>
              <ProfileEditor
                key={JSON.stringify(memory.profile)}
                profile={memory.profile}
                saved={memory.profileSaved}
              />
            </section>
          )}
          <label className="block max-w-xs text-sm">
            {t("memory:memoryLanguage")}
            <select
              className={control}
              value={language}
              onChange={(event) => {
                setLanguage(event.target.value);
                setLimit(20);
              }}
            >
              <option value="">{t("memory:allLanguages")}</option>
              {languages.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          {view !== "corrections" && (
            <section
              aria-label={t("memory:knowledgeMemory")}
              className="space-y-3 rounded border border-line bg-surface p-5"
            >
              <h2 className="font-semibold">
                {t("memory:knowledgeMemory2")}
                {formatNumber(knowledge.length)}
              </h2>
              <p className="text-sm text-ink-muted">
                {t("memory:usageIsEvidenceOfPracticeNotCorrectnessOrMasteryGuided")}
              </p>
              {!knowledge.length && (
                <p className="text-sm">
                  {t("memory:noVocabularyObservationsYetStartALessonToCollectEvidence")}
                </p>
              )}
              <ul className="divide-y divide-line">
                {knowledge.slice(0, limit).map((item) => (
                  <li key={`${item.language}:${item.item}`} className="space-y-1 py-3 text-sm">
                    <p className="font-medium">
                      {item.item} · {item.language} ·{" "}
                      {item.mastery === "new"
                        ? t("memory:notUsedYet")
                        : t("memory:learningNotAMasteryAssessment")}
                    </p>
                    <p>
                      {t("memory:practiceTurns")}
                      {formatNumber(item.practiceTurns)} {t("memory:matches")}
                      {formatNumber(item.occurrences)} {t("memory:guided")}{" "}
                      {formatNumber(item.guidedTurns)} {t("memory:freeConversation")}
                      {formatNumber(item.freeTurns)}
                    </p>
                    {item.latest && (
                      <>
                        <blockquote className="break-words text-ink-muted">
                          “{item.latest.quote}” ·{" "}
                          {item.latest.source === "free-conversation"
                            ? t("common:freeConversation.title")
                            : item.latest.title}
                        </blockquote>
                        {sourceButton(item.latest.lessonId, item.latest.source)}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {view !== "vocabulary" && (
            <section
              aria-label={t("memory:errorMemory")}
              className="space-y-3 rounded border border-line bg-surface p-5"
            >
              <h2 className="font-semibold">
                {t("memory:errorMemory2")}
                {formatNumber(errors.length)}
              </h2>
              <p className="text-sm text-ink-muted">
                {t("memory:savedDiagnosisObservationsNotProofOfAnOngoingMistakeDemo")}
              </p>
              {!errors.length && (
                <p className="text-sm">{t("memory:noDiagnosedLanguageIssuesRecorded")}</p>
              )}
              <ul className="divide-y divide-line">
                {errors.slice(0, limit).map((item, index) => (
                  <li key={`${item.language}:${index}`} className="space-y-1 py-3 text-sm">
                    <p className="break-words font-medium">{item.pattern}</p>
                    <p>
                      {item.language} · {t(`training:categories.${item.category}`)}{" "}
                      {t("memory:practiceReplies")}
                      {formatNumber(item.count)} {t("memory:modelObservations")}
                      {formatNumber(item.modelCount)} {t("memory:demoObservations")}
                      {formatNumber(item.guidedCount)}
                    </p>
                    <details>
                      <summary className="cursor-pointer">
                        {t("memory:explanationAndSource")}
                      </summary>
                      <p className="my-2 break-words">{item.explanation}</p>
                      <blockquote className="break-words">
                        “{item.latest.quote}” ·{" "}
                        {item.latest.source === "free-conversation"
                          ? t("common:freeConversation.title")
                          : item.latest.title}
                      </blockquote>
                      {sourceButton(item.latest.lessonId, item.latest.source)}
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {view === "all" && (
            <section
              aria-label={t("memory:episodicMemory")}
              className="space-y-3 rounded border border-line bg-surface p-5"
            >
              <h2 className="font-semibold">
                {t("memory:episodicMemory2")}
                {formatNumber(episodes.length)}
              </h2>
              {!episodes.length && <p className="text-sm">{t("memory:noPracticeHistoryYet")}</p>}
              <ul className="divide-y divide-line">
                {episodes.slice(0, limit).map((item) => (
                  <li key={item.lessonId} className="space-y-1 py-3 text-sm">
                    <p className="font-medium">
                      {item.source === "free-conversation"
                        ? t("common:freeConversation.title")
                        : item.title}{" "}
                      · {item.language}
                      {item.source !== "free-conversation" && (
                        <> · {item.completed ? t("memory:completed") : t("memory:inProgress")}</>
                      )}
                    </p>
                    <p>
                      {item.source === "free-conversation"
                        ? t("memory:conversationPracticeCount", {
                            total: formatNumber(item.practiceTurns ?? 0),
                          })
                        : item.summary}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {t("memory:lastSaved")}
                      {formatDateTime(item.at)}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      {sourceButton(item.lessonId, item.source)}
                      <button
                        type="button"
                        className="text-xs font-medium text-error-ink underline"
                        disabled={busy}
                        onClick={() => setDeleting(item.lessonId)}
                      >
                        {t("memory:controls.deleteSource")}
                      </button>
                    </div>
                    {deleting === item.lessonId && (
                      <div
                        role="group"
                        aria-label={t("memory:controls.confirmDelete")}
                        className="space-y-2 rounded-lg border border-error-line bg-chat-error p-3"
                      >
                        <p>{t("memory:controls.deleteDescription")}</p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={button}
                            disabled={busy}
                            onClick={() => setDeleting(null)}
                          >
                            {t("memory:controls.cancel")}
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-error-line px-3 py-2 font-medium text-error-ink"
                            disabled={busy}
                            onClick={() =>
                              void deletePracticeSource(
                                item.lessonId,
                                item.source ?? "training",
                              ).then((ok) => {
                                if (ok) setDeleting(null);
                              })
                            }
                          >
                            {t("memory:controls.confirmDelete")}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {Math.max(
            view === "corrections" ? 0 : knowledge.length,
            view === "vocabulary" ? 0 : errors.length,
            view === "all" ? episodes.length : 0,
          ) > limit && (
            <button type="button" className={button} onClick={() => setLimit(limit + 20)}>
              {t("memory:showMoreMemories")}
            </button>
          )}
        </>
      )}
    </section>
  );
}
