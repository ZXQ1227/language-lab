import { formatNumber } from "../i18n";
import { useTranslation } from "react-i18next";
import type { ErrorDiagnosisRecord } from "@language-lab/core";
import type { TrainingSession } from "../training/session";

const categories = {
  grammar: "training:categories.grammar",
  vocabulary: "training:categories.vocabulary",
  collocation: "training:categories.collocation",
  tense: "training:categories.tense",
  article: "training:categories.article",
  spelling: "training:categories.spelling",
};

function Correction({
  record,
  session,
}: {
  record: ErrorDiagnosisRecord;
  session: TrainingSession;
}) {
  const { t } = useTranslation();
  const error =
    record.correctionIndex === undefined
      ? undefined
      : record.diagnosis.errors[record.correctionIndex];
  const message = session.messages.find((item) => item.seq === record.messageSeq);
  if (!error || !message) return null;
  return (
    <div
      aria-label={t("training:correction")}
      className="space-y-2 rounded-lg border border-error-line bg-chat-error p-4 text-sm text-error-ink"
    >
      <p className="font-medium">
        {t(categories[error.category])} ·{" "}
        {error.severity === "meaning" ? t("training:affectsMeaning") : t("training:form")}
      </p>
      <blockquote>
        {t("training:reply")}
        {formatNumber(Math.ceil(record.messageSeq / 2))}: “{message.content.slice(0, error.start)}
        <mark className="rounded-sm bg-error-mark text-error-ink">{error.original}</mark>
        {message.content.slice(error.end)}”
      </blockquote>
      <p>
        {error.original} → <strong>{error.corrected}</strong>
      </p>
      <details>
        <summary className="cursor-pointer font-medium">{t("training:whyThisWording")}</summary>
        <p className="mt-2">{error.explanation}</p>
      </details>
      {record.diagnosis.errors.length > 1 && (
        <p className="text-xs">{t("training:onePointToFocusOnBeforeContinuingTheConversation")}</p>
      )}
    </div>
  );
}

export function LanguageFeedback({ session }: { session: TrainingSession }) {
  const { t } = useTranslation();
  const records = session.diagnoses ?? [];
  const latest = records.at(-1);
  if (!latest) return null;
  const earlier = records.slice(0, -1).filter((record) => record.correctionIndex !== undefined);
  const policy = session.state.courseTemplate?.teachingPolicy;
  return (
    <section
      aria-label={t("training:languageFeedback")}
      className="space-y-3 rounded-lg border border-line bg-surface p-4 text-sm"
    >
      <h3 className="font-medium">
        {t("training:languageFeedbackReply")}
        {formatNumber(Math.ceil(latest.messageSeq / 2))}
      </h3>
      {latest.diagnosis.source === "demo" && (
        <p className="text-ink-muted">
          {t("training:guidedDemoChecksAFewExamplePatternsOnlyConnectAI")}
        </p>
      )}
      {latest.correctionIndex !== undefined ? (
        <Correction record={latest} session={session} />
      ) : latest.interventionReason === "correction_spacing" ? (
        <p>{t("training:letSKeepTheConversationMovingCorrectionsAreSpacedBetween")}</p>
      ) : latest.interventionReason === "recently_corrected" ? (
        <p>{t("training:youHaveSeenThisCorrectionRecentlyKeepPractisingBeforeAnother")}</p>
      ) : latest.interventionReason === "not_lightweight" ? (
        <p>{t("training:thisSuggestionNeedsALongerRewriteLetSKeepThe")}</p>
      ) : latest.interventionReason === "objectives_complete" ? (
        <p>{t("training:theSceneIsCompleteContinueToYourLessonReview")}</p>
      ) : policy?.correctionMode === "off" ? (
        <p>{t("training:liveCorrectionsAreTurnedOffForThisCourse")}</p>
      ) : latest.diagnosis.errors.length > 0 ? (
        <p>
          {policy && session.state.correctionsGiven >= policy.maxCorrections
            ? t("training:theLiveCorrectionLimitHasBeenReachedKeepPractising")
            : t("training:thisReplyWasRecordedWithoutALiveCorrection")}
        </p>
      ) : (
        <p>{t("training:noHighConfidenceCorrectionWasFoundInThisReply")}</p>
      )}
      {latest.diagnosis.status === "uncertain" && latest.diagnosis.source === "model" && (
        <p className="text-ink-muted">
          {t("training:someWordingNeedsMoreContextUncertainSuggestionsWereNotTreated")}
        </p>
      )}
      <p className="text-xs text-ink-muted">
        {t("training:keepYourIntendedMeaningWhenTryingACorrectionSpokenFluency")}
      </p>
      {earlier.length > 0 && (
        <details>
          <summary className="cursor-pointer text-ink">
            {t("training:earlierFeedback")}
            {formatNumber(earlier.length)}
          </summary>
          <div className="mt-3 space-y-3">
            {earlier.map((record) => (
              <Correction key={record.messageSeq} record={record} session={session} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
