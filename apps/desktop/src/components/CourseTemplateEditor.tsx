import { useState } from "react";
import { useTrainingStore } from "../stores/training";
import { useNavStore } from "../stores/nav";
import {
  cefrLevelSchema,
  configureScenarioContent,
  createLessonStateFromScenario,
  type ScenarioContent,
} from "@language-lab/core";

export function CourseTemplateEditor({ scenario }: { scenario: ScenarioContent }) {
  const trainingBusy = useTrainingStore((state) => state.busy);
  const template = scenario.courseTemplate;
  const [difficulty, setDifficulty] = useState(scenario.difficulty);
  const [correctionMode, setCorrectionMode] = useState(
    template?.teachingPolicy.correctionMode ?? "gentle",
  );
  const [maxCorrections, setMaxCorrections] = useState(
    String(template?.teachingPolicy.maxCorrections ?? 3),
  );
  const [maxHints, setMaxHints] = useState(String(template?.teachingPolicy.maxHints ?? 3));
  const [exportError, setExportError] = useState<string | null>(null);
  if (!template) return null;

  let configured: ScenarioContent | null = null;
  let validationError: string | null = null;
  try {
    configured = configureScenarioContent(scenario, {
      difficulty,
      teachingPolicy: {
        correctionMode,
        maxCorrections: maxCorrections.trim() === "" ? NaN : Number(maxCorrections),
        maxHints: maxHints.trim() === "" ? NaN : Number(maxHints),
      },
    });
  } catch {
    validationError = "Enter whole-number feedback budgets between 0 and 20.";
  }
  const preview = configured
    ? createLessonStateFromScenario({ lessonId: "preview", scenario: configured, now: 0 })
    : null;

  function exportTemplate() {
    if (!configured) return;
    setExportError(null);
    try {
      const blob = new Blob([JSON.stringify(configured, null, 2) + "\n"], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${configured.slug}-course.json`;
      link.click();
      // Let the webview begin the download before releasing its object URL.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setExportError(
        cause instanceof Error ? cause.message : "Could not export the template. Try again.",
      );
    }
  }

  const controlClass =
    "mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900";
  return (
    <details className="mt-4 border-t border-slate-200 pt-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-800">
        Configure course
      </summary>
      <div className="mt-4 space-y-5">
        <p className="text-xs text-slate-500">
          Configure a copy and export it to keep your changes. Import that file to use the template
          again.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-600">
            Practice level
            <select
              className={controlClass}
              value={difficulty}
              onChange={(event) => setDifficulty(cefrLevelSchema.parse(event.target.value))}
            >
              {cefrLevelSchema.options.map((level) => (
                <option key={level}>{level}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-600">
            Correction style
            <select
              className={controlClass}
              value={correctionMode}
              onChange={(event) =>
                setCorrectionMode(event.target.value === "off" ? "off" : "gentle")
              }
            >
              <option value="gentle">Gentle corrections</option>
              <option value="off">Corrections off</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">
            Maximum corrections
            <input
              className={controlClass}
              type="number"
              min={0}
              max={20}
              step={1}
              value={maxCorrections}
              onChange={(event) => setMaxCorrections(event.target.value)}
            />
          </label>
          <label className="text-sm text-slate-600">
            Maximum hints
            <input
              className={controlClass}
              type="number"
              min={0}
              max={20}
              step={1}
              value={maxHints}
              onChange={(event) => setMaxHints(event.target.value)}
            />
          </label>
        </div>
        {validationError && (
          <p role="alert" className="text-sm text-red-700">
            {validationError}
          </p>
        )}
        {preview && (
          <div
            aria-label="Lesson preview"
            className="space-y-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600"
          >
            <h3 className="font-semibold text-slate-900">
              Lesson preview · {preview.difficulty} · {template.estimatedMinutes} minutes
            </h3>
            <p>{template.setting}</p>
            <p>
              <strong>Your role:</strong> {template.roles.learner}
            </p>
            <p>
              <strong>Practice partner:</strong> {template.roles.partner}
            </p>
            <p>
              <strong>Opening:</strong> {template.openingLine}
            </p>
            <h4 className="font-medium text-slate-900">Useful expressions</h4>
            <ul className="list-disc space-y-1 pl-5">
              {template.targetPatterns.map((item) => (
                <li key={item.pattern}>
                  <strong>{item.pattern}</strong> — {item.example}
                </li>
              ))}
            </ul>
            <h4 className="font-medium text-slate-900">Practice steps</h4>
            <ol className="list-decimal space-y-3 pl-5">
              {template.stages.map((stage) => (
                <li key={stage.id}>
                  <p className="font-medium text-slate-800">{stage.title}</p>
                  <p>{stage.instruction}</p>
                  <p className="mt-1 text-xs font-medium">Success criteria</p>
                  <ul className="list-disc pl-4">
                    {stage.successCriteria.map((criterion) => (
                      <li key={criterion}>{criterion}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        )}
        {exportError && (
          <p role="alert" className="text-sm text-red-700">
            {exportError}
          </p>
        )}
        <button
          type="button"
          disabled={!configured}
          onClick={exportTemplate}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Export course JSON
        </button>
        <button
          type="button"
          disabled={!configured || trainingBusy}
          className="ml-3 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-40"
          onClick={() => {
            if (!configured || useTrainingStore.getState().busy) return;
            useTrainingStore.getState().prepare(configured);
            useNavStore.getState().navigate("training");
          }}
        >
          Practise this course
        </button>
      </div>
    </details>
  );
}
