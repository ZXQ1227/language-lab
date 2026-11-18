import { formatDateTime, formatNumber } from "../i18n";
import { useTranslation } from "react-i18next";
import { uiValue } from "../i18n";
import { buildLearningReport } from "@language-lab/core";
import type { TrainingSession } from "../training/session";
import { useTrainingStore } from "../stores/training";
import { useNavStore } from "../stores/nav";

function ReviewLaunch({ session }: { session: TrainingSession }) {
  const { t } = useTranslation();
  const { busy, generateReview, loadReport } = useTrainingStore();
  const navigate = useNavStore((s) => s.navigate);
  return (
    <button
      className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40"
      disabled={busy}
      onClick={() =>
        void (async () => {
          if (!session.reviewPlan && !(await generateReview(session.id))) return;
          if (await loadReport(session.id)) navigate("review");
        })()
      }
    >
      {session.reviewPlan ? t("reports:openTargetedReview") : t("reports:generateTargetedReview")}
    </button>
  );
}

export function LearningReport({ session }: { session: TrainingSession }) {
  const { t } = useTranslation();
  if (!session.report) return null;
  const report = session.learningReport ?? buildLearningReport(session);
  const criteria = report.stages.flatMap((stage) => stage.criteria);
  const used = report.vocabulary.filter((v) => v.usedTurns > 0);
  return (
    <section
      aria-label={t("reports:lessonReview")}
      className="space-y-5 rounded-lg border border-emerald-200 bg-white p-5"
    >
      <div>
        <h2 className="font-semibold">
          {t("reports:lessonReview")}
          {session.provider.mode === "demo" ? t("reports:guidedDemo2") : ""}
        </h2>
        <p className="mt-1 text-sm">
          {session.scenario.title} · {session.state.difficulty} ·{" "}
          {session.state.courseTemplate?.targetLanguage}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {report.provenance === "reconstructed"
            ? t("reports:reconstructedFromALegacyCheckpointOriginalReportTimeIsUnavailable")
            : t("reports:completedValue", {
                v0: uiValue(formatDateTime(report.generatedAt)),
              })}
        </p>
      </div>
      {session.provider.mode === "demo" && (
        <p className="text-sm">
          {t("reports:youCompletedTheGuidedExamplesThisIsADemonstrationNot")}
        </p>
      )}
      <div aria-label={t("reports:practiceSummary")} className="rounded bg-slate-50 p-3 text-sm">
        <p>
          {t("reports:goalCriteriaWithEvidence")}
          {formatNumber(criteria.filter((c) => c.met).length)}/{formatNumber(criteria.length)}{" "}
          {t("reports:targetWordsUsed")}
          {formatNumber(used.length)}/{formatNumber(report.vocabulary.length)}
        </p>
        <p>
          {t("reports:practiceReplies")}
          {formatNumber(report.practiceTurns)} {t("reports:helpRequests")}
          {formatNumber(report.supportTurns)} {t("reports:hintsGiven")}
          {formatNumber(report.hintsGiven)}
        </p>
      </div>
      <section aria-label={t("reports:goalEvidence")} className="space-y-3">
        <h3 className="font-medium">{t("reports:whatWentWellGoalEvidence")}</h3>
        <p className="text-xs text-slate-500">
          {t("reports:stageJudgmentsAreBackedByExactLearnerQuotesTheyDescribe")}
        </p>
        {report.stages.map((stage) => (
          <details key={stage.id} className="rounded border border-slate-200 p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              {stage.objectives.join(" · ")} ·{" "}
              {formatNumber(stage.criteria.filter((c) => c.met).length)}/
              {formatNumber(stage.criteria.length)}
            </summary>
            <ul className="mt-2 space-y-2">
              {stage.criteria.map((criterion, index) => (
                <li key={index}>
                  <p>
                    {criterion.met ? t("reports:demonstrated") : t("reports:notDemonstrated")}:{" "}
                    {criterion.description}
                  </p>
                  {criterion.evidence.map((cite, i) => (
                    <blockquote key={i} className="ml-3 break-words border-l-2 pl-3 text-slate-600">
                      “{cite.quote}
                      {t("reports:message")}
                      {formatNumber(cite.messageSeq)}
                    </blockquote>
                  ))}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>
      <section aria-label={t("reports:reportVocabulary")} className="space-y-2 text-sm">
        <h3 className="font-medium">{t("reports:vocabularyPractice")}</h3>
        <p className="text-xs text-slate-500">
          {t("reports:exactLexicalMatchesInLearnerPracticeOnlyUseDoesNot")}
        </p>
        <ul className="space-y-2">
          {report.vocabulary.map((item) => (
            <li key={item.term}>
              <span className="font-medium">{item.term}</span> ·{" "}
              {item.usedTurns
                ? t("reports:valuePracticeRepliesValueMatches", {
                    v0: uiValue(item.usedTurns),
                    v1: uiValue(item.occurrences),
                  })
                : t("reports:notUsedYet")}
              {item.latest && (
                <blockquote className="ml-3 break-words text-slate-600">
                  “{item.latest.content}
                  {t("reports:message")}
                  {formatNumber(item.latest.messageSeq)}
                </blockquote>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section aria-label={t("reports:reportLanguageIssues")} className="space-y-2 text-sm">
        <h3 className="font-medium">{t("reports:languageIssuesAndCorrections")}</h3>
        <p>
          {t("reports:diagnosisRecordedFor")}
          {formatNumber(report.diagnosedTurns)}/{formatNumber(report.practiceTurns)}{" "}
          {t("reports:practiceRepliesUncertainChecks")}
          {formatNumber(report.uncertainTurns)} {t("reports:withheldSuggestions")}{" "}
          {formatNumber(report.withheldSuggestions)}
        </p>
        <p>
          {t("reports:correctionsRecorded")}
          {formatNumber(report.correctionsGiven)} {t("reports:withVerifiedDialogueDelivery")}{" "}
          {formatNumber(report.issues.filter((issue) => issue.deliveryVerified).length)}
        </p>
        <p className="text-xs text-slate-500">
          {t("reports:modelJudgmentsCanBeWrongDemoChecksCoverLimitedExamples")}
        </p>
        {!report.issues.length && (
          <p>{t("reports:noLanguageIssuesRecordedInTheAvailableChecksThisDoes")}</p>
        )}
        {report.issues.map((issue, index) => (
          <details key={index} className="rounded border border-slate-200 p-3">
            <summary className="cursor-pointer break-words">
              “{issue.error.original}” → “{issue.error.corrected}” ·{" "}
              {issue.deliveryVerified
                ? t("reports:shownInDialogue")
                : issue.shown
                  ? t("reports:recordedAsShownLegacyDeliveryUnverified")
                  : t("reports:forReview")}
            </summary>
            <p className="mt-2 break-words">{issue.error.explanation}</p>
            <blockquote className="mt-2 break-words text-slate-600">
              “{session.messages.find((message) => message.seq === issue.messageSeq)?.content}”
            </blockquote>
            <p className="text-xs text-slate-500">
              {t(`training:categories.${issue.error.category}`)} ·{" "}
              {issue.source === "demo"
                ? t("reports:limitedDemoCheck")
                : t("reports:modelSuggestion")}{" "}
              {t("reports:message2")}
              {formatNumber(issue.messageSeq)}
            </p>
          </details>
        ))}
      </section>
      <section aria-label={t("reports:nextPractice")} className="space-y-2 text-sm">
        <h3 className="font-medium">{t("reports:nextPractice")}</h3>
        <ol className="list-decimal space-y-3 pl-5">
          {report.nextPractice.map((task) => (
            <li key={task.id}>
              <p className="break-words">{task.prompt}</p>
              {task.source && (
                <p className="text-xs text-slate-500">
                  {t("reports:from")}
                  {task.source.quote}
                  {t("reports:message")}
                  {formatNumber(task.source.messageSeq)}
                </p>
              )}
              {task.suggestedAnswer && (
                <details>
                  <summary className="cursor-pointer text-slate-600">
                    {t("reports:showExample")}
                  </summary>
                  <p className="break-words">{task.suggestedAnswer}</p>
                </details>
              )}
            </li>
          ))}
        </ol>
      </section>
      <ReviewLaunch session={session} />
      {session.provider.mode === "ai" && (
        <details
          aria-label={t("reports:modelCommentary")}
          className="rounded bg-slate-50 p-3 text-sm"
        >
          <summary className="cursor-pointer font-medium">
            {t("reports:modelCommentarySubjectiveEstimate")}
          </summary>
          <p className="mt-2 text-xs text-slate-500">
            {t("reports:modelEstimate")}
            {formatNumber(session.report.score)}
            {t("reports:100ThisIsNotAProficiencyAssessmentOrAMeasure")}
          </p>
          <p className="mt-2 break-words">{session.report.summary}</p>
          <h4 className="mt-2 font-medium">{t("reports:suggestedStrengths")}</h4>
          <ul className="list-disc pl-5">
            {session.report.strengths.map((s, i) => (
              <li className="break-words" key={i}>
                {s}
              </li>
            ))}
          </ul>
          <h4 className="mt-2 font-medium">{t("reports:suggestedImprovements")}</h4>
          <ul className="list-disc pl-5">
            {session.report.improvements.map((s, i) => (
              <li className="break-words" key={i}>
                {s}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
