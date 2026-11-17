import type { ErrorDiagnosisRecord } from "@language-lab/core";
import type { TrainingSession } from "../training/session";

const categories = {
  grammar: "Grammar",
  vocabulary: "Word choice",
  collocation: "Word combination",
  tense: "Tense",
  article: "Article",
  spelling: "Spelling",
};

function Correction({
  record,
  session,
}: {
  record: ErrorDiagnosisRecord;
  session: TrainingSession;
}) {
  const error =
    record.correctionIndex === undefined
      ? undefined
      : record.diagnosis.errors[record.correctionIndex];
  const message = session.messages.find((item) => item.seq === record.messageSeq);
  if (!error || !message) return null;
  return (
    <div
      aria-label="Correction"
      className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm"
    >
      <p className="font-medium">
        {categories[error.category]} · {error.severity === "meaning" ? "Affects meaning" : "Form"}
      </p>
      <blockquote>
        Reply {Math.ceil(record.messageSeq / 2)}: “{message.content.slice(0, error.start)}
        <mark className="bg-amber-200">{error.original}</mark>
        {message.content.slice(error.end)}”
      </blockquote>
      <p>
        {error.original} → <strong>{error.corrected}</strong>
      </p>
      <details>
        <summary className="cursor-pointer text-slate-700">Why this wording?</summary>
        <p className="mt-2">{error.explanation}</p>
      </details>
      {record.diagnosis.errors.length > 1 && (
        <p className="text-xs text-slate-600">
          One point to focus on before continuing the conversation.
        </p>
      )}
    </div>
  );
}

export function LanguageFeedback({ session }: { session: TrainingSession }) {
  const records = session.diagnoses ?? [];
  const latest = records.at(-1);
  if (!latest) return null;
  const earlier = records.slice(0, -1).filter((record) => record.correctionIndex !== undefined);
  const policy = session.state.courseTemplate?.teachingPolicy;
  return (
    <section
      aria-label="Language feedback"
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm"
    >
      <h3 className="font-medium">Language feedback · reply {Math.ceil(latest.messageSeq / 2)}</h3>
      {latest.diagnosis.source === "demo" && (
        <p className="text-slate-500">
          Guided demo checks a few example patterns only. Connect AI for grammar and word-choice
          assessment.
        </p>
      )}
      {latest.correctionIndex !== undefined ? (
        <Correction record={latest} session={session} />
      ) : latest.interventionReason === "correction_spacing" ? (
        <p>Let's keep the conversation moving. Corrections are spaced between practice turns.</p>
      ) : latest.interventionReason === "recently_corrected" ? (
        <p>You have seen this correction recently. Keep practising before another reminder.</p>
      ) : latest.interventionReason === "not_lightweight" ? (
        <p>This suggestion needs a longer rewrite. Let's keep the conversation moving.</p>
      ) : latest.interventionReason === "objectives_complete" ? (
        <p>The scene is complete. Continue to your lesson review.</p>
      ) : policy?.correctionMode === "off" ? (
        <p>Live corrections are turned off for this course.</p>
      ) : latest.diagnosis.errors.length > 0 ? (
        <p>
          {policy && session.state.correctionsGiven >= policy.maxCorrections
            ? "The live correction limit has been reached. Keep practising."
            : "This reply was recorded without a live correction."}
        </p>
      ) : (
        <p>No high-confidence correction was found in this reply.</p>
      )}
      {latest.diagnosis.status === "uncertain" && latest.diagnosis.source === "model" && (
        <p className="text-slate-500">
          Some wording needs more context. Uncertain suggestions were not treated as errors.
        </p>
      )}
      <p className="text-xs text-slate-500">
        Keep your intended meaning when trying a correction. Spoken fluency is not assessed from
        text.
      </p>
      {earlier.length > 0 && (
        <details>
          <summary className="cursor-pointer text-slate-700">
            Earlier feedback · {earlier.length}
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
