import { useEffect, useState } from "react";
import { profileMemorySchema, type LearningProfile } from "@language-lab/memory";
import { useTrainingStore } from "../stores/training";
import { useNavStore } from "../stores/nav";

const control = "mt-1 block w-full rounded border border-slate-300 bg-white p-2 text-sm";
const button = "rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40";

function ProfileEditor({ profile, saved }: { profile: LearningProfile; saved: boolean }) {
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
          setError(
            "Use a language code such as en, a CEFR level, and at most 10 goals of 200 characters each.",
          );
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
          ? "Unsaved profile changes."
          : saved
            ? "Your stated profile is saved on this device."
            : "No profile saved yet. Defaults are not an assessment."}{" "}
        Practice never changes your stated level automatically.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Target language code
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
          Your stated level
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
        Learning goals · one per line
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
          {error}
        </p>
      )}
      <button type="submit" className={button} disabled={busy}>
        Save profile
      </button>
    </form>
  );
}

export function LearningMemoryPage() {
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
      Open source lesson
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
    <section aria-label="Learning memory" className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Learning memory</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your profile, vocabulary observations, language issues and practice history across
            lessons.
          </p>
        </div>
        <button type="button" className={button} disabled={busy} onClick={() => void load()}>
          Refresh memory
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
          <button
            type="button"
            className="ml-3 underline"
            disabled={busy}
            onClick={() => void load()}
          >
            Retry memory load
          </button>
        </div>
      )}
      {!memory && !error && <p role="status">Loading learning memory…</p>}
      {memory && (
        <>
          <section
            aria-label="Profile memory"
            className="space-y-3 rounded border border-slate-200 bg-white p-5"
          >
            <h2 className="font-semibold">Profile memory</h2>
            <ProfileEditor
              key={JSON.stringify(memory.profile)}
              profile={memory.profile}
              saved={memory.profileSaved}
            />
          </section>
          <label className="block max-w-xs text-sm">
            Memory language
            <select
              className={control}
              value={language}
              onChange={(event) => {
                setLanguage(event.target.value);
                setLimit(20);
              }}
            >
              <option value="">All languages</option>
              {languages.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <section
            aria-label="Knowledge memory"
            className="space-y-3 rounded border border-slate-200 bg-white p-5"
          >
            <h2 className="font-semibold">Knowledge memory · {knowledge.length}</h2>
            <p className="text-sm text-slate-500">
              Usage is evidence of practice, not correctness or mastery. Guided examples and free
              conversation are counted separately.
            </p>
            {!knowledge.length && (
              <p className="text-sm">
                No vocabulary observations yet. Start a lesson to collect evidence.
              </p>
            )}
            <ul className="divide-y divide-slate-100">
              {knowledge.slice(0, limit).map((item) => (
                <li key={`${item.language}:${item.item}`} className="space-y-1 py-3 text-sm">
                  <p className="font-medium">
                    {item.item} · {item.language} ·{" "}
                    {item.mastery === "new"
                      ? "Not used yet"
                      : "Learning · not a mastery assessment"}
                  </p>
                  <p>
                    Practice turns: {item.practiceTurns} · Matches: {item.occurrences} · Guided:{" "}
                    {item.guidedTurns} · Free conversation: {item.freeTurns}
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
            aria-label="Error memory"
            className="space-y-3 rounded border border-slate-200 bg-white p-5"
          >
            <h2 className="font-semibold">Error memory · {errors.length}</h2>
            <p className="text-sm text-slate-500">
              Saved diagnosis observations, not proof of an ongoing mistake. Demo checks are
              limited; model judgments can be wrong.
            </p>
            {!errors.length && <p className="text-sm">No diagnosed language issues recorded.</p>}
            <ul className="divide-y divide-slate-100">
              {errors.slice(0, limit).map((item, index) => (
                <li key={`${item.language}:${index}`} className="space-y-1 py-3 text-sm">
                  <p className="break-words font-medium">{item.pattern}</p>
                  <p>
                    {item.language} · {item.category} · Practice replies: {item.count} · Model
                    observations: {item.modelCount} · Demo observations: {item.guidedCount}
                  </p>
                  <details>
                    <summary className="cursor-pointer">Explanation and source</summary>
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
            aria-label="Episodic memory"
            className="space-y-3 rounded border border-slate-200 bg-white p-5"
          >
            <h2 className="font-semibold">Episodic memory · {episodes.length}</h2>
            {!episodes.length && <p className="text-sm">No practice history yet.</p>}
            <ul className="divide-y divide-slate-100">
              {episodes.slice(0, limit).map((item) => (
                <li key={item.lessonId} className="space-y-1 py-3 text-sm">
                  <p className="font-medium">
                    {item.title} · {item.language} · {item.completed ? "Completed" : "In progress"}
                  </p>
                  <p>{item.summary}</p>
                  <p className="text-xs text-slate-500">
                    Last saved: {new Date(item.at).toLocaleString()}
                  </p>
                  {sourceButton(item.lessonId)}
                </li>
              ))}
            </ul>
          </section>
          {Math.max(knowledge.length, errors.length, episodes.length) > limit && (
            <button type="button" className={button} onClick={() => setLimit(limit + 20)}>
              Show more memories
            </button>
          )}
        </>
      )}
    </section>
  );
}
