import { LocalizedError } from "../components/LocalizedError";
import { formatDateTime, formatNumber } from "../i18n";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { profileMemorySchema, type LearningProfile } from "@language-lab/memory";
import { useTrainingStore } from "../stores/training";
import { useNavStore } from "../stores/nav";

const control = "mt-1 block w-full rounded border border-slate-300 bg-white p-2 text-sm";
const button = "rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40";

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
      <p className="text-sm text-slate-500">
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
        <p role="alert" className="text-sm text-red-700">
          <LocalizedError error={error} />
        </p>
      )}
      <button type="submit" className={button} disabled={busy}>
        {t("memory:saveProfile")}
      </button>
    </form>
  );
}

export function LearningMemoryPage() {
  const { t } = useTranslation();
  const { learningMemory: memory, loaded, busy, error, load, openLesson } = useTrainingStore();
  const navigate = useNavStore((state) => state.navigate);
  const [language, setLanguage] = useState("");
  const [limit, setLimit] = useState(20);
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  const sourceButton = (id: string) => (
    <button
      type="button"
      className="text-xs font-medium underline disabled:opacity-40"
      disabled={busy}
      onClick={() =>
        void openLesson(id).then((opened) => {
          if (opened) navigate("training");
        })
      }
    >
      {t("memory:openSourceLesson")}
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
    <section aria-label={t("memory:learningMemory")} className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("memory:learningMemory")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("memory:yourProfileVocabularyObservationsLanguageIssuesAndPracticeHistoryAcross")}
          </p>
        </div>
        <button type="button" className={button} disabled={busy} onClick={() => void load()}>
          {t("memory:refreshMemory")}
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
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
          <section
            aria-label={t("memory:profileMemory")}
            className="space-y-3 rounded border border-slate-200 bg-white p-5"
          >
            <h2 className="font-semibold">{t("memory:profileMemory")}</h2>
            <ProfileEditor
              key={JSON.stringify(memory.profile)}
              profile={memory.profile}
              saved={memory.profileSaved}
            />
          </section>
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
          <section
            aria-label={t("memory:knowledgeMemory")}
            className="space-y-3 rounded border border-slate-200 bg-white p-5"
          >
            <h2 className="font-semibold">
              {t("memory:knowledgeMemory2")}
              {formatNumber(knowledge.length)}
            </h2>
            <p className="text-sm text-slate-500">
              {t("memory:usageIsEvidenceOfPracticeNotCorrectnessOrMasteryGuided")}
            </p>
            {!knowledge.length && (
              <p className="text-sm">
                {t("memory:noVocabularyObservationsYetStartALessonToCollectEvidence")}
              </p>
            )}
            <ul className="divide-y divide-slate-100">
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
                      <blockquote className="break-words text-slate-600">
                        “{item.latest.quote}” · {item.latest.title}
                      </blockquote>
                      {sourceButton(item.latest.lessonId)}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section
            aria-label={t("memory:errorMemory")}
            className="space-y-3 rounded border border-slate-200 bg-white p-5"
          >
            <h2 className="font-semibold">
              {t("memory:errorMemory2")}
              {formatNumber(errors.length)}
            </h2>
            <p className="text-sm text-slate-500">
              {t("memory:savedDiagnosisObservationsNotProofOfAnOngoingMistakeDemo")}
            </p>
            {!errors.length && (
              <p className="text-sm">{t("memory:noDiagnosedLanguageIssuesRecorded")}</p>
            )}
            <ul className="divide-y divide-slate-100">
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
                    <summary className="cursor-pointer">{t("memory:explanationAndSource")}</summary>
                    <p className="my-2 break-words">{item.explanation}</p>
                    <blockquote className="break-words">
                      “{item.latest.quote}” · {item.latest.title}
                    </blockquote>
                    {sourceButton(item.latest.lessonId)}
                  </details>
                </li>
              ))}
            </ul>
          </section>
          <section
            aria-label={t("memory:episodicMemory")}
            className="space-y-3 rounded border border-slate-200 bg-white p-5"
          >
            <h2 className="font-semibold">
              {t("memory:episodicMemory2")}
              {formatNumber(episodes.length)}
            </h2>
            {!episodes.length && <p className="text-sm">{t("memory:noPracticeHistoryYet")}</p>}
            <ul className="divide-y divide-slate-100">
              {episodes.slice(0, limit).map((item) => (
                <li key={item.lessonId} className="space-y-1 py-3 text-sm">
                  <p className="font-medium">
                    {item.title} · {item.language} ·{" "}
                    {item.completed ? t("memory:completed") : t("memory:inProgress")}
                  </p>
                  <p>{item.summary}</p>
                  <p className="text-xs text-slate-500">
                    {t("memory:lastSaved")}
                    {formatDateTime(item.at)}
                  </p>
                  {sourceButton(item.lessonId)}
                </li>
              ))}
            </ul>
          </section>
          {Math.max(knowledge.length, errors.length, episodes.length) > limit && (
            <button type="button" className={button} onClick={() => setLimit(limit + 20)}>
              {t("memory:showMoreMemories")}
            </button>
          )}
        </>
      )}
    </section>
  );
}
