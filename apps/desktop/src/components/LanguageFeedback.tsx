import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { languageVerdict, type ErrorDiagnosis } from "@language-lab/core";
import { speechPlaybackTextLimit } from "../speech/playback";

const categories = {
  grammar: "training:categories.grammar",
  vocabulary: "training:categories.vocabulary",
  collocation: "training:categories.collocation",
  tense: "training:categories.tense",
  article: "training:categories.article",
  spelling: "training:categories.spelling",
};

interface MessageProps {
  text: string;
  language: string;
  readDisabled: boolean;
  onRead: (text: string) => void;
}

export function LanguageFeedback({
  text,
  language,
  readDisabled,
  onRead,
  diagnosis,
}: MessageProps & { diagnosis: ErrorDiagnosis }) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const verdict = languageVerdict(text, diagnosis, language);
  if (!verdict) return null;
  const status = verdict.kind === "accurate" ? "checked" : "suggestion";
  const error = verdict.kind === "accurate" ? undefined : verdict.edit;
  const isError = verdict.kind === "error";
  const style = error
    ? "border-warning-line bg-chat-hint text-hint-ink"
    : "border-success-line bg-chat-success text-success-ink";
  const before = error ? text.slice(0, error.start) : "";
  const after = error ? text.slice(error.end) : "";
  const suggested = error ? before + error.corrected + after : "";

  return (
    <div className="mt-2.5 text-sm text-ink">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold hover:brightness-95 ${style}`}
      >
        <span
          aria-hidden="true"
          className="grid size-4 place-items-center rounded-full border border-current text-[0.625rem] leading-none"
        >
          {error ? "!" : "✓"}
        </span>
        {t(`training:messageFeedback.${status}`)}
      </button>
      <div id={id} hidden={!open}>
        {open && (
          <section
            aria-label={t(isError ? "training:correction" : "training:languageFeedback")}
            className="mt-2 space-y-2 rounded-xl border border-line bg-surface p-3 leading-relaxed"
          >
            {error ? (
              <>
                <div
                  className={`rounded-lg border px-3 py-2 ${isError ? "border-error-line bg-chat-error text-error-ink" : "border-line bg-surface-secondary text-ink"}`}
                >
                  <p className="text-xs font-semibold">{t("training:messageFeedback.original")}</p>
                  <p lang={language} className="whitespace-pre-wrap wrap-break-word">
                    {before}
                    {isError ? (
                      <mark className="rounded-sm bg-error-mark font-semibold text-error-ink">
                        {error.original}
                      </mark>
                    ) : (
                      <strong>{error.original}</strong>
                    )}
                    {after}
                  </p>
                </div>
                <div className="rounded-lg border border-success-line bg-chat-success px-3 py-2 text-success-ink">
                  <p className="text-xs font-semibold">
                    {t("training:messageFeedback.suggestionText")}
                  </p>
                  <p lang={language} className="whitespace-pre-wrap wrap-break-word">
                    {before}
                    <strong>{error.corrected}</strong>
                    {after}
                  </p>
                  <button
                    type="button"
                    className="mt-1.5 min-h-8 rounded-full border border-success-line bg-surface px-2.5 text-xs font-semibold enabled:hover:bg-surface-hover disabled:opacity-50"
                    disabled={readDisabled || suggested.length > speechPlaybackTextLimit}
                    onClick={() => onRead(suggested)}
                  >
                    {t("training:messageFeedback.readSuggestion")}
                  </button>
                </div>
                <p className="px-1 text-xs font-semibold text-ink-muted">
                  {t(
                    isError
                      ? "training:messageFeedback.actualError"
                      : "training:messageFeedback.improvement",
                  )}{" "}
                  · {t(categories[error.category])}
                </p>
                <p className="px-1 break-words">{error.explanation}</p>
              </>
            ) : (
              <p>{t("training:messageFeedback.accurateExplanation")}</p>
            )}
            {diagnosis.source === "demo" && (
              <p className="text-xs text-ink-muted">
                {t("training:guidedDemoChecksAFewExamplePatternsOnlyConnectAI")}
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
