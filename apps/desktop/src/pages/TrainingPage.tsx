import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LessonSetup } from "../components/LessonSetup";
import { LessonConversation } from "../components/LessonConversation";
import { SavedPracticePicker } from "../components/SavedPracticePicker";
import { LocalizedError } from "../components/LocalizedError";
import { loadScenarioContent } from "../content/scenarioContent";
import { matchesLibraryDifficulty } from "../content/courseDifficulty";
import { useNavStore } from "../stores/nav";
import { useTrainingStore } from "../stores/training";

const courses = loadScenarioContent();
const control = "mt-1 w-full rounded-lg border form-control px-3 py-2 text-sm";

export function TrainingPage() {
  const { t } = useTranslation();
  const { session, pendingCourse, loaded, busy, error, load } = useTrainingStore();
  const navigate = useNavStore((state) => state.navigate);
  const trainingReturnPage = useNavStore((state) => state.trainingReturnPage);
  const difficulty = useNavStore((state) =>
    state.trainingReturnPage === "scenarios" ? state.libraryDifficulty : "all",
  );
  const [courseSlug, setCourseSlug] = useState("cafe-order");
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  const options = courses.filter((item) => matchesLibraryDifficulty(item.difficulty, difficulty));
  const course = pendingCourse ?? options.find((item) => item.slug === courseSlug) ?? options[0];
  if (loaded && session) return <LessonConversation key={session.id} session={session} />;
  return (
    <section aria-label={t("training:training")} className="mx-auto max-w-2xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("training:training")}</h1>
        <button
          type="button"
          className="text-sm font-semibold text-brand-ink underline underline-offset-4"
          disabled={busy}
          onClick={() => navigate(trainingReturnPage)}
        >
          {t("training:focus.back")}
        </button>
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-error-line bg-chat-error p-4 text-sm text-error-ink"
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
          <SavedPracticePicker />
          {pendingCourse ? (
            <p className="text-sm text-ink-muted">
              {t("training:usingYourConfiguredCourseTemplate")}
            </p>
          ) : course ? (
            <label className="block text-sm">
              {t("training:course")}
              <select
                className={control}
                disabled={busy}
                value={course.slug}
                onChange={(event) => setCourseSlug(event.target.value)}
              >
                {options.map((item) => (
                  <option value={item.slug} key={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p role="status" className="text-sm text-ink-muted">
              {t("scenarios:noMatchingLessons")}
            </p>
          )}
          {course && <LessonSetup key={JSON.stringify(course)} course={course} />}
        </>
      )}
    </section>
  );
}
