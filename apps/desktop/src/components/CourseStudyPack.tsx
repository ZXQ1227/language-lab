import { useState } from "react";
import type { CourseTemplate } from "@language-lab/core";
import type { TrainingSession } from "../training/session";

export function CourseStudyPack({ template }: { template: CourseTemplate }) {
  const pack = template.learningPack;
  if (!pack) return null;
  const challenge = pack.variations.find((item) => item.id === template.selectedVariationId);
  return (
    <section
      aria-label="Course study pack"
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600"
    >
      <div>
        <h3 className="font-semibold text-slate-900">
          Your complete lesson · {template.stages.length} steps · {template.estimatedMinutes}{" "}
          minutes
        </h3>
        <p className="mt-2">{pack.overview}</p>
      </div>
      {challenge && (
        <div className="rounded-md bg-amber-50 p-3">
          <h4 className="font-medium text-slate-900">Challenge: {challenge.title}</h4>
          <p>{challenge.briefing}</p>
        </div>
      )}
      <div>
        <h4 className="font-medium text-slate-900">Before you start</h4>
        <ul className="mt-1 list-disc pl-5">
          {pack.prerequisites.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <details>
        <summary className="cursor-pointer font-medium text-slate-900">Practice guest card</summary>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          {pack.scenarioFacts.map((fact) => (
            <div key={fact.label} className="rounded bg-slate-50 p-2">
              <dt className="font-medium text-slate-800">{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </details>
      <details>
        <summary className="cursor-pointer font-medium text-slate-900">
          Warm-up · {pack.warmup.length} short tasks
        </summary>
        <ol className="mt-3 list-decimal space-y-3 pl-5">
          {pack.warmup.map((exercise) => (
            <li key={exercise.id}>
              <p>{exercise.prompt}</p>
              <details className="mt-1">
                <summary className="cursor-pointer text-slate-500">
                  Compare with a sample answer
                </summary>
                <p className="mt-1 rounded bg-slate-50 p-2">{exercise.suggestedAnswer}</p>
              </details>
            </li>
          ))}
        </ol>
      </details>
      <details>
        <summary className="cursor-pointer font-medium text-slate-900">
          Vocabulary and meaning · {pack.vocabulary.length} words and phrases
        </summary>
        <dl className="mt-3 space-y-3">
          {pack.vocabulary.map((item) => (
            <div key={item.term} className="border-l-2 border-emerald-200 pl-3">
              <dt className="font-medium text-slate-900">
                {item.term}
                {item.translation ? ` · ${item.translation}` : ""}
              </dt>
              <dd>
                {item.meaning}
                <p className="mt-1 italic">{item.example}</p>
                {item.forms?.length ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Accepted forms: {item.forms.join(", ")}
                  </p>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </details>
      <details>
        <summary className="cursor-pointer font-medium text-slate-900">
          Useful expressions · {template.targetPatterns.length} patterns
        </summary>
        <dl className="mt-3 space-y-2">
          {template.targetPatterns.map((item) => (
            <div key={item.pattern}>
              <dt className="font-medium text-slate-800">{item.pattern}</dt>
              <dd>{item.example}</dd>
            </div>
          ))}
        </dl>
      </details>
      <details>
        <summary className="cursor-pointer font-medium text-slate-900">
          Model conversation · standard scenario
        </summary>
        <p className="mt-2 text-xs text-slate-500">
          Read for useful language, then practise your own replies. Challenges change the
          receptionist's situation.
        </p>
        <ol className="mt-3 space-y-2">
          {pack.modelDialogue.map((line, index) => (
            <li key={index} className="rounded bg-slate-50 p-2">
              <span className="font-medium">
                {line.role === "learner" ? "You" : "Practice partner"}:{" "}
              </span>
              {line.text}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

export function CourseReviewPractice({
  session,
  busy,
  onSave,
}: {
  session: TrainingSession;
  busy: boolean;
  onSave: (answers: Record<string, string>) => Promise<boolean>;
}) {
  const pack = session.state.courseTemplate?.learningPack;
  const [answers, setAnswers] = useState<Record<string, string>>(session.reviewAnswers ?? {});
  const [saved, setSaved] = useState(false);
  if (!pack) return null;
  return (
    <section
      aria-label="Independent review practice"
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
    >
      <h2 className="font-semibold text-slate-900">Independent review practice</h2>
      <p className="text-sm text-slate-500">
        Try from memory, then compare with the examples. These answers are self-checked and saved
        separately from your conversation score.
      </p>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(answers).then(setSaved);
        }}
      >
        {pack.reviewPractice.map((exercise, index) => (
          <div key={exercise.id} className="space-y-2 text-sm">
            <p className="font-medium text-slate-800">
              {index + 1}. {exercise.prompt}
            </p>
            <label className="block text-slate-600">
              Review answer {index + 1}
              <textarea
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                rows={3}
                maxLength={2000}
                disabled={busy}
                value={answers[exercise.id] ?? ""}
                onChange={(event) => {
                  setAnswers((current) => ({ ...current, [exercise.id]: event.target.value }));
                  setSaved(false);
                }}
              />
            </label>
            <details className="text-slate-600">
              <summary className="cursor-pointer">Compare with example</summary>
              <p className="mt-2 rounded bg-slate-50 p-3">{exercise.suggestedAnswer}</p>
            </details>
          </div>
        ))}
        <button
          type="submit"
          disabled={busy || !Object.values(answers).some((answer) => answer.trim())}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Save review answers
        </button>
        {saved && (
          <p role="status" className="text-sm text-emerald-700">
            Review answers saved on this device.
          </p>
        )}
      </form>
    </section>
  );
}
