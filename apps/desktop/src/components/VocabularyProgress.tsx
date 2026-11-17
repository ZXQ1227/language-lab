import { useMemo } from "react";
import { summarizeVocabulary } from "@language-lab/core";
import type { TrainingSession } from "../training/session";

export function VocabularyProgress({ session }: { session: TrainingSession }) {
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
      aria-label="Vocabulary progress"
      className="rounded-lg border border-slate-200 bg-white p-4 text-sm"
    >
      <summary className="cursor-pointer font-medium">
        Vocabulary progress · {used}/{progress.length} used
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-slate-500">
          Counts show practice turns containing a word or an accepted form, not mastery or
          correctness. Partner replies and help requests are excluded.
        </p>
        {session.provider.mode === "demo" && (
          <p className="text-slate-500">Guided examples count as supported practice.</p>
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
                    ? `Used in ${item.usedTurns} practice ${item.usedTurns === 1 ? "turn" : "turns"} · ${item.occurrences} ${item.occurrences === 1 ? "match" : "matches"}`
                    : "Not used yet"}
                </p>
                {material && (
                  <p className="text-slate-600">
                    {material.meaning}
                    {material.translation ? ` · ${material.translation}` : ""}
                  </p>
                )}
                {material?.forms?.length ? (
                  <p className="text-xs text-slate-500">
                    Also accepts: {material.forms.join(", ")}
                  </p>
                ) : null}
                {evidence && (
                  <blockquote className="border-l-2 border-sky-300 pl-2 text-slate-600">
                    Latest evidence · reply {Math.ceil(evidence.messageSeq / 2)}: “
                    {evidence.content.slice(0, evidence.start)}
                    <mark className="bg-sky-100">{evidence.quote}</mark>
                    {evidence.content.slice(evidence.end)}”
                  </blockquote>
                )}
                {!evidence && material && <p className="text-slate-500">Try: {material.example}</p>}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
