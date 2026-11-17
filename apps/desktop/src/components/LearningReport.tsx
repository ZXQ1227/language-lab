import { buildLearningReport } from "@language-lab/core";
import type { TrainingSession } from "../training/session";

export function LearningReport({ session }: { session: TrainingSession }) {
  if (!session.report) return null;
  const report = session.learningReport ?? buildLearningReport(session);
  const criteria = report.stages.flatMap((stage) => stage.criteria);
  const used = report.vocabulary.filter((v) => v.usedTurns > 0);
  return (
    <section
      aria-label="Lesson review"
      className="space-y-5 rounded-lg border border-emerald-200 bg-white p-5"
    >
      <div>
        <h2 className="font-semibold">
          Lesson review{session.provider.mode === "demo" ? " · guided demo" : ""}
        </h2>
        <p className="mt-1 text-sm">
          {session.scenario.title} · {session.state.difficulty} ·{" "}
          {session.state.courseTemplate?.targetLanguage}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {report.provenance === "reconstructed"
            ? "Reconstructed from a legacy checkpoint; original report time is unavailable."
            : `Completed: ${new Date(report.generatedAt).toLocaleString()}`}
        </p>
      </div>
      {session.provider.mode === "demo" && (
        <p className="text-sm">
          You completed the guided examples. This is a demonstration, not an independent language
          assessment.
        </p>
      )}
      <div aria-label="Practice summary" className="rounded bg-slate-50 p-3 text-sm">
        <p>
          Goal criteria with evidence: {criteria.filter((c) => c.met).length}/{criteria.length} ·
          Target words used: {used.length}/{report.vocabulary.length}
        </p>
        <p>
          Practice replies: {report.practiceTurns} · Help requests: {report.supportTurns} · Hints
          given: {report.hintsGiven}
        </p>
      </div>
      <section aria-label="Goal evidence" className="space-y-3">
        <h3 className="font-medium">What went well · goal evidence</h3>
        <p className="text-xs text-slate-500">
          Stage judgments are backed by exact learner quotes. They describe this exercise, not
          independent mastery.
        </p>
        {report.stages.map((stage) => (
          <details key={stage.id} className="rounded border border-slate-200 p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              {stage.objectives.join(" · ")} · {stage.criteria.filter((c) => c.met).length}/
              {stage.criteria.length}
            </summary>
            <ul className="mt-2 space-y-2">
              {stage.criteria.map((criterion, index) => (
                <li key={index}>
                  <p>
                    {criterion.met ? "Demonstrated" : "Not demonstrated"}: {criterion.description}
                  </p>
                  {criterion.evidence.map((cite, i) => (
                    <blockquote key={i} className="ml-3 break-words border-l-2 pl-3 text-slate-600">
                      “{cite.quote}” · message #{cite.messageSeq}
                    </blockquote>
                  ))}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>
      <section aria-label="Report vocabulary" className="space-y-2 text-sm">
        <h3 className="font-medium">Vocabulary practice</h3>
        <p className="text-xs text-slate-500">
          Exact lexical matches in learner practice only. Use does not prove correctness or mastery.
        </p>
        <ul className="space-y-2">
          {report.vocabulary.map((item) => (
            <li key={item.term}>
              <span className="font-medium">{item.term}</span> ·{" "}
              {item.usedTurns
                ? `${item.usedTurns} practice replies · ${item.occurrences} matches`
                : "Not used yet"}
              {item.latest && (
                <blockquote className="ml-3 break-words text-slate-600">
                  “{item.latest.content}” · message #{item.latest.messageSeq}
                </blockquote>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Report language issues" className="space-y-2 text-sm">
        <h3 className="font-medium">Language issues and corrections</h3>
        <p>
          Diagnosis recorded for {report.diagnosedTurns}/{report.practiceTurns} practice replies ·
          Uncertain checks: {report.uncertainTurns} · Withheld suggestions:{" "}
          {report.withheldSuggestions}
        </p>
        <p>
          Corrections recorded: {report.correctionsGiven} · With verified dialogue delivery:{" "}
          {report.issues.filter((issue) => issue.deliveryVerified).length}
        </p>
        <p className="text-xs text-slate-500">
          Model judgments can be wrong; demo checks cover limited examples. Missing checks are
          unknown. A shown correction does not prove that an issue is resolved.
        </p>
        {!report.issues.length && (
          <p>
            No language issues recorded in the available checks. This does not mean the lesson was
            error-free.
          </p>
        )}
        {report.issues.map((issue, index) => (
          <details key={index} className="rounded border border-slate-200 p-3">
            <summary className="cursor-pointer break-words">
              “{issue.error.original}” → “{issue.error.corrected}” ·{" "}
              {issue.deliveryVerified
                ? "Shown in dialogue"
                : issue.shown
                  ? "Recorded as shown · legacy delivery unverified"
                  : "For review"}
            </summary>
            <p className="mt-2 break-words">{issue.error.explanation}</p>
            <blockquote className="mt-2 break-words text-slate-600">
              “{session.messages.find((message) => message.seq === issue.messageSeq)?.content}”
            </blockquote>
            <p className="text-xs text-slate-500">
              {issue.error.category} ·{" "}
              {issue.source === "demo" ? "Limited demo check" : "Model suggestion"} · message #
              {issue.messageSeq}
            </p>
          </details>
        ))}
      </section>
      <section aria-label="Next practice" className="space-y-2 text-sm">
        <h3 className="font-medium">Next practice</h3>
        <ol className="list-decimal space-y-3 pl-5">
          {report.nextPractice.map((task) => (
            <li key={task.id}>
              <p className="break-words">{task.prompt}</p>
              {task.source && (
                <p className="text-xs text-slate-500">
                  From “{task.source.quote}” · message #{task.source.messageSeq}
                </p>
              )}
              {task.suggestedAnswer && (
                <details>
                  <summary className="cursor-pointer text-slate-600">Show example</summary>
                  <p className="break-words">{task.suggestedAnswer}</p>
                </details>
              )}
            </li>
          ))}
        </ol>
      </section>
      {session.provider.mode === "ai" && (
        <details aria-label="Model commentary" className="rounded bg-slate-50 p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Model commentary · subjective estimate
          </summary>
          <p className="mt-2 text-xs text-slate-500">
            Model estimate: {session.report.score}/100. This is not a proficiency assessment or a
            measure of improvement. Commentary is unverified interpretation; the evidence above
            remains the source of lesson facts.
          </p>
          <p className="mt-2 break-words">{session.report.summary}</p>
          <h4 className="mt-2 font-medium">Suggested strengths</h4>
          <ul className="list-disc pl-5">
            {session.report.strengths.map((s, i) => (
              <li className="break-words" key={i}>
                {s}
              </li>
            ))}
          </ul>
          <h4 className="mt-2 font-medium">Suggested improvements</h4>
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
