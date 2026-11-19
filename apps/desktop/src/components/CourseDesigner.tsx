import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ScenarioContent } from "@language-lab/core";
import type { LearningProfile } from "@language-lab/memory";
import { courseGoalMaxLength, designCourse } from "@language-lab/skills";
import { useAiProviderStore } from "../stores/aiProvider";
import { useNavStore } from "../stores/nav";
import { trainingGateway } from "../training/gateway";
import { toTrainingProvider } from "../training/provider";

export function CourseDesigner({
  profile,
  disabled,
  onPreview,
}: {
  profile: LearningProfile;
  disabled: boolean;
  onPreview: (course: ScenarioContent) => void;
}) {
  const { t } = useTranslation();
  const { configured, settings, loaded, busy, error, load } = useAiProviderStore();
  const navigate = useNavStore((state) => state.navigate);
  const [goal, setGoal] = useState("");
  const [generating, setGenerating] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    void load();
    return () => pending.current?.abort();
  }, [load]);

  if (!configured) {
    return (
      <section
        aria-label={t("common:courseDesigner.title")}
        className="rounded-2xl border border-line bg-surface p-5 sm:p-6"
      >
        {error ? (
          <button
            type="button"
            className="mt-3 text-sm font-semibold text-ink underline underline-offset-4"
            onClick={() => void load()}
            disabled={busy}
          >
            {t("common:courseDesigner.reloadSettings")}
          </button>
        ) : loaded ? (
          <button
            type="button"
            className="mt-3 text-sm font-semibold text-ink underline underline-offset-4"
            onClick={() => navigate("settings")}
          >
            {t("common:courseDesigner.configure")}
          </button>
        ) : (
          <p role="status" className="mt-2 text-sm text-ink-muted">
            {t("common:courseDesigner.loadingSettings")}
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label={t("common:courseDesigner.title")}
      className="rounded-2xl border border-line-info bg-surface p-5 sm:p-6"
    >
      <p className="text-sm text-ink-muted">
        {t("common:courseDesigner.profile", {
          language: profile.targetLanguage,
          level: profile.level,
        })}
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!goal.trim() || pending.current || disabled || busy || error) return;
          const controller = new AbortController();
          pending.current = controller;
          setGenerating(true);
          setFailed(false);
          try {
            const modelGateway = await trainingGateway(toTrainingProvider(settings));
            if (controller.signal.aborted) return;
            const course = await designCourse(
              { goal, level: profile.level, targetLanguage: profile.targetLanguage },
              { modelGateway, signal: controller.signal },
            );
            if (!controller.signal.aborted) onPreview(course);
          } catch {
            if (!controller.signal.aborted) setFailed(true);
          } finally {
            pending.current = null;
            if (!controller.signal.aborted) setGenerating(false);
          }
        }}
      >
        <label className="block text-sm font-semibold">
          {t("common:courseDesigner.goal")}
          <textarea
            className="form-control mt-1.5 block min-h-20 w-full resize-y rounded-lg border px-3 py-2 font-normal"
            rows={2}
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder={t("common:courseDesigner.example")}
            maxLength={courseGoalMaxLength}
            disabled={generating}
            required
          />
        </label>
        <p className="text-sm text-ink-muted">{t("common:courseDesigner.providerNotice")}</p>
        {error && (
          <button
            type="button"
            className="text-sm font-semibold text-ink underline underline-offset-4"
            disabled={busy}
            onClick={() => void load()}
          >
            {t("common:courseDesigner.reloadSettings")}
          </button>
        )}
        {failed && (
          <p role="alert" className="text-sm text-error-ink">
            {t("common:courseDesigner.failed")}
          </p>
        )}
        <button
          type="submit"
          className="rounded-lg button-primary px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          disabled={disabled || busy || !!error || generating || !goal.trim()}
        >
          {generating ? t("common:courseDesigner.generating") : t("common:courseDesigner.generate")}
        </button>
        {generating && (
          <span role="status" className="sr-only">
            {t("common:courseDesigner.generating")}
          </span>
        )}
      </form>
    </section>
  );
}
