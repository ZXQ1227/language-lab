import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DiagnosedError, ErrorDiagnosisRecord, InterventionReason } from "@language-lab/core";
import { speechPlaybackTextLimit } from "../speech/playback";

const categories = {
  grammar: "training:categories.grammar",
  vocabulary: "training:categories.vocabulary",
  collocation: "training:categories.collocation",
  tense: "training:categories.tense",
  article: "training:categories.article",
  spelling: "training:categories.spelling",
};

const deferral: Partial<Record<InterventionReason, string>> = {
  correction_spacing: "training:letSKeepTheConversationMovingCorrectionsAreSpacedBetween",
  recently_corrected: "training:youHaveSeenThisCorrectionRecentlyKeepPractisingBeforeAnother",
  not_lightweight: "training:thisSuggestionNeedsALongerRewriteLetSKeepThe",
  objectives_complete: "training:theSceneIsCompleteContinueToYourLessonReview",
  corrections_off: "training:liveCorrectionsAreTurnedOffForThisCourse",
  budget_exhausted: "training:theLiveCorrectionLimitHasBeenReachedKeepPractising",
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
  error,
  checked,
  note,
  demo,
}: MessageProps & { error?: DiagnosedError; checked?: boolean; note?: string; demo?: boolean }) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const status = error ? "suggestion" : checked ? "checked" : "details";
  const style = error
    ? "border-warning-line bg-chat-hint text-hint-ink"
    : checked
      ? "border-success-line bg-chat-success text-success-ink"
      : "border-line bg-surface-secondary text-ink";
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
          {error ? "!" : checked ? "✓" : "·"}
        </span>
        {t(`training:messageFeedback.${status}`)}
      </button>
      <div id={id} hidden={!open}>
        {open && (
          <section
            aria-label={t(error ? "training:correction" : "training:languageFeedback")}
            className="mt-2 space-y-2 rounded-xl border border-line bg-surface p-3 leading-relaxed"
          >
            {error ? (
              <>
                <div className="rounded-lg border border-error-line bg-chat-error px-3 py-2 text-error-ink">
                  <p className="text-xs font-semibold">{t("training:messageFeedback.original")}</p>
                  <p lang={language} className="whitespace-pre-wrap wrap-break-word">
                    {before}
                    <mark className="rounded-sm bg-error-mark font-semibold text-error-ink">
                      {error.original}
                    </mark>
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
                  {t(categories[error.category])} ·{" "}
                  {error.severity === "meaning" ? t("training:affectsMeaning") : t("training:form")}
                </p>
                <p className="px-1 break-words">{error.explanation}</p>
              </>
            ) : (
              <p>{note ?? t("training:noHighConfidenceCorrectionWasFoundInThisReply")}</p>
            )}
            {demo && (
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

export function TrainingMessageFeedback({
  record,
  legacyReason,
  ...message
}: MessageProps & { record: ErrorDiagnosisRecord; legacyReason?: InterventionReason }) {
  const { t } = useTranslation();
  const { diagnosis, correctionIndex } = record;
  const error = correctionIndex === undefined ? undefined : diagnosis.errors[correctionIndex];
  const reason = record.interventionReason ?? legacyReason;
  const noteKey =
    (reason && deferral[reason]) ||
    (diagnosis.status === "uncertain" && diagnosis.source === "model"
      ? "training:someWordingNeedsMoreContextUncertainSuggestionsWereNotTreated"
      : diagnosis.errors.length
        ? "training:thisReplyWasRecordedWithoutALiveCorrection"
        : undefined);
  return (
    <LanguageFeedback
      {...message}
      error={error}
      checked={!noteKey && diagnosis.status === "checked" && diagnosis.errors.length === 0}
      note={noteKey ? t(noteKey) : undefined}
      demo={diagnosis.source === "demo"}
    />
  );
}
