import { formatNumber } from "../i18n";
import { useTranslation } from "react-i18next";
import { uiValue } from "../i18n";
import { useMemo } from "react";
import { summarizeVocabulary } from "@language-lab/core";
import type { TrainingSession } from "../training/session";

export function VocabularyProgress({ session }: { session: TrainingSession }) {
  const { t } = useTranslation();
  const vocabulary = session.state.courseTemplate?.learningPack?.vocabulary;
  const progress = useMemo(
    () =>
      summarizeVocabulary(
        session.state.targetVocabulary,
        session.messages,
        vocabulary?.map((item) => ({ term: item.term, forms: item.forms ?? [] })),
      ),
    [session.state.targetVocabulary, session.messages, vocabulary],
  );
  const used = progress.filter((item) => item.usedTurns > 0).length;
  return (
    <details
      aria-label={t("training:vocabularyProgress")}
      className="rounded-lg border border-slate-200 bg-white p-4 text-sm"
    >
      <summary className="cursor-pointer font-medium">
        {t("training:vocabularyProgress2")}
        {formatNumber(used)}/{formatNumber(progress.length)} {t("training:used")}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-slate-500">
          {t("training:countsShowPracticeTurnsContainingAWordOrAnAccepted")}
        </p>
        {session.provider.mode === "demo" && (
          <p className="text-slate-500">{t("training:guidedExamplesCountAsSupportedPractice")}</p>
        )}
        <ul className="divide-y divide-slate-100">
          {progress.map((item) => {
            const material = vocabulary?.find((entry) => entry.term === item.term);
            const evidence = item.latest;
            return (
              <li key={item.term} className="space-y-1 py-3">
                <p className="font-medium">
                  {item.term} ·{" "}
                  {item.usedTurns
                    ? t("training:usedInValuePracticeValueValueValue", {
                        v0: uiValue(item.usedTurns),
                        v1: uiValue(
                          item.usedTurns === 1 ? t("training:turn") : t("training:turns"),
                        ),
                        v2: uiValue(item.occurrences),
                        v3: uiValue(
                          item.occurrences === 1 ? t("training:match") : t("training:matches"),
                        ),
                      })
                    : t("training:notUsedYet")}
                </p>
                {material && (
                  <p className="text-slate-600">
                    {material.meaning}
                    {material.translation
                      ? t("training:value", { v0: uiValue(material.translation) })
                      : ""}
                  </p>
                )}
                {material?.forms?.length ? (
                  <p className="text-xs text-slate-500">
                    {t("training:alsoAccepts")}
                    {material.forms.join(", ")}
                  </p>
                ) : null}
                {evidence && (
                  <blockquote className="border-l-2 border-sky-300 pl-2 text-slate-600">
                    {t("training:latestEvidenceReply")}
                    {formatNumber(Math.ceil(evidence.messageSeq / 2))}: “
                    {evidence.content.slice(0, evidence.start)}
                    <mark className="bg-sky-100">{evidence.quote}</mark>
                    {evidence.content.slice(evidence.end)}”
                  </blockquote>
                )}
                {!evidence && material && (
                  <p className="text-slate-500">
                    {t("training:try")}
                    {material.example}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
