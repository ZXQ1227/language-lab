# Scenario course templates (08)

Scenario files in `content/scenarios/*.json` are configurable teaching material.
`packages/core/src/scenario.ts` is the authoritative Zod boundary;
`content/scenario.schema.json` is its JSON Schema representation for authoring
tools. The JSON Schema describes structural constraints. Zod additionally checks
stage ids, objective references and complete objective coverage.

## Author a course

Copy `content/scenarios/cafe-order.json` and change its id, slug and title.
The filename must be `<slug>.json`. Add it to the explicit imports in
`apps/desktop/src/content/scenarioContent.ts`; the content tests check that the
bundle matches the directory.

| Field                                      | Meaning                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `schemaVersion`                            | Currently `1`; unsupported versions are rejected.                                                                  |
| `id`, `slug`, `title`, `category`          | Stable identity and scenario library metadata.                                                                     |
| `difficulty`                               | CEFR level, `A1` through `C2`.                                                                                     |
| `objectives`                               | Nonempty array of learner outcomes. The existing lesson runtime assigns ids `obj-1`, `obj-2`, etc. in array order. |
| `targetVocabulary`                         | Nonempty array of target words or phrases.                                                                         |
| `courseTemplate.targetLanguage`            | Language used in the course's dialogue prompt.                                                                     |
| `courseTemplate.estimatedMinutes`          | Duration estimate (1–120), not a completion timer.                                                                 |
| `courseTemplate.setting`                   | Context for the conversation.                                                                                      |
| `courseTemplate.roles.learner`, `.partner` | Learner role and AI character.                                                                                     |
| `courseTemplate.openingLine`               | Authored opening shown in the lesson preview and available in the lesson snapshot.                                 |
| `courseTemplate.targetPatterns`            | Nonempty array of `{ pattern, example }` expressions.                                                              |
| `courseTemplate.stages`                    | Ordered practice stages (1–12).                                                                                    |
| `courseTemplate.teachingPolicy`            | Correction style and per-lesson feedback budgets.                                                                  |

Complete courses may also include `courseTemplate.learningPack` (facts, vocabulary
meanings, warm-up, model dialogue, guided practice, review tasks and variations)
and an optional `selectedVariationId`. [Hotel Check-in](HOTEL_CHECKIN.md) is the
first complete example. Stage references and all required study material are
validated before use.

Each stage has a unique kebab-case `id`, `title`, partner `instruction`, nonempty
`objectiveIds`, nonempty `successCriteria`, and `hints` (may be empty). Every
objective must be assigned to exactly one stage. References to missing objectives
are invalid. Keep objective order stable when editing an existing course, or
update the stage references together.

Success criteria should describe observable learner behavior, for example
"The learner names a drink and a snack". They should not award completion for a
fixed number of turns. The authored opening and examples are material to practise,
not evidence that the learner has achieved an objective.

`teachingPolicy.correctionMode` is `gentle` or `off`; `maxCorrections` and
`maxHints` are integer per-lesson budgets from 0 to 20. A budget of 0 disables
that intervention. Turning corrections off still allows error analysis and
learning-event recording. Legacy courses without a policy retain the existing
intervention behavior.

## Configure, preview, export and import

In **Scenarios**, expand **Configure course** on a bundled scenario. Change
the practice level, correction style or feedback budgets. The preview uses the
same `createLessonStateFromScenario` compiler as `TeachingOrchestrator.initLesson`.
Invalid budgets disable export. **Export course JSON** downloads a complete,
validated scenario file with those settings, including all its authored stages.

**Import course template** accepts a JSON file up to 1 MB. It validates the full
schema and cross-references before adding an editable preview. Imports with the
same slug replace the previous imported preview. Imports and edits are held for
the current visit to Scenarios; export a copy before leaving the page. These
operations do not change the bundled library or write learning records.

The import/export file is also the authoring format: change roles, vocabulary,
patterns, stages and success criteria in JSON, then import to validate and preview.
The form exposes level and feedback options; it does not generate new authored
activities when the level changes.

## Runtime integration

`ScenarioView.courseTemplate` carries authored content through the existing data
port. `resolveCourseTemplate` compiles a chosen challenge from the original source
without mutating its standard stages. Checkpoints contain the resolved snapshot;
exported templates retain their editable source and selected challenge id.
The desktop Training composition returns the selected bundled or imported
course from `findScenario`. The current SQLite `scenarios` row stays a metadata
projection; no database migration is necessary for this step.

`TeachingOrchestrator.initLesson({ ..., configuration })` validates the selected
scenario and copies the configured course into `LessonState.courseTemplate`.
`configuration` supports an optional CEFR `difficulty` and partial
`teachingPolicy`. Serialization and restoration validate the snapshot, including
its objective references. Later content changes cannot alter this course.

On each turn, the runtime uses the snapshot for the character, setting, teaching
level, target language, vocabulary, expressions, stage instructions, success
criteria and permitted hints. Diagnosis uses the configured lesson level.
The deterministic intervention skill enforces the snapshotted feedback budgets;
the counters survive state serialization.

`getCurrentCourseStage` selects the first stage with incomplete objectives.
The [teaching loop](TEACHING_LOOP.md) now evaluates stage criteria with exact
learner-message citations, updates objective state and advances to the next stage.
**Practise this course** opens the configured copy in Training.

## Compatibility and checks

Seven-field legacy scenarios without `schemaVersion` or `courseTemplate` remain
readable and compile to the existing lesson state. Missing versions normalize to
version 1. Tests require all new shipped scenarios to include authored courses.
Existing serialized lesson states without a course snapshot remain readable.
The state version stays 1 because the snapshot is an additive optional field.
Unknown fields, unsupported versions and invalid CEFR levels fail validation.

Run `pnpm typecheck && pnpm lint && pnpm test`, then `pnpm test:e2e` and
`pnpm --filter @language-lab/desktop build`. The unit suite checks the JSON Schema
against `z.toJSONSchema(scenarioContentSchema, { io: "input" })`; regenerate
`content/scenario.schema.json` from that expression when changing the Zod schema.
