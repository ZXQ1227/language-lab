# Scenario course templates (08)

Scenario files in `content/scenarios/*.json` are configurable teaching material.
`packages/core/src/scenario.ts` is the authoritative Zod boundary;
`content/scenario.schema.json` is its JSON Schema representation for authoring
tools. The JSON Schema describes structural constraints. Zod additionally checks
stage ids, objective references and complete objective coverage.

## Author a course

Copy an existing lesson from `content/scenarios/` and change its id, slug
and title. The filename must be `<slug>.json`. List the slug once in the
ordered path in `content/starter-catalog.json`. The desktop bundle reads
the files and validates that the catalog contains exactly those lessons.

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

For bilingual study material, an expression can include `translation`, and a
study pack can include `languageNotes`. Both fields are optional in version 1.
Keep the English expression in `pattern` and `example`.

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

## Starter library

Under **Home → Course library**, the five learning paths follow the supplied
course outlines in order. Each topic has a practice lesson. Travel also includes
the existing café lesson as a supplement.

| Order | Learning path         | Lessons | First lesson                        |
| ----- | --------------------- | ------- | ----------------------------------- |
| 01    | Travel & stays        | 9       | Checking in for a flight            |
| 02    | Career development    | 9       | Taking a recruiter screening call   |
| 03    | Study & campus life   | 6       | Clarifying an essay at office hours |
| 04    | Living abroad         | 10      | Replacing an item at a supermarket  |
| 05    | Everyday conversation | 7       | Small talk with a colleague         |

The 37 new lessons adapt the outlines into specific three-step roleplays.
They include English examples with Chinese translations, contextual vocabulary,
a common mistake note, a warm-up, model turns and a review task. Hotel Check-in,
Seeing a doctor and Small talk with a colleague cover the corresponding
topics with their existing material. All 41 lessons offer guided offline
practice and can use connected AI for open-ended answers. New A2 learners
see airport check-in first on the plan. Follow-up recommendations account
for target language, stated level and completed lessons.

## AI-designed lessons

With an AI connection saved in Settings, open the learning plan and describe
a concrete goal under **Design a lesson with AI**. The request sends that
goal, the profile's target language and stated CEFR level, and a ten-minute
length to the configured provider. It makes no automatic request on startup.
Without a saved connection, the plan leads with the built-in recommendation.
Built-in lessons remain available if generation fails or while offline.

The Course Designer uses one structured generation call. Its draft includes
roles, a setting and opening line, vocabulary, example expressions, and two
to four sequential steps with observable criteria and a hint for each step.
The app assigns identity, objective references and the teaching policy, then
validates the complete version 1 scenario. The preview shows the objectives,
setting and sample language. Starting a lesson uses connected AI and saves the
usual local checkpoint, including the generated course. Generating a preview
does not write a lesson, and an unstarted draft does not survive app restart.

The same evidence checks, correction budgets, reports and review pipeline
apply during the lesson. A schema check ensures the material can enter that
pipeline. The model supplies its wording and teaching content. Generated drafts
are individual roleplay lessons with no generated catalog or automatic sequence.
See [ADR-0019](../adr/ADR-0019-validated-ai-course-design.md).

## Runtime integration

`ScenarioView.courseTemplate` carries authored content through the existing data
port. `resolveCourseTemplate` compiles a chosen challenge from the original source
without mutating its standard stages. Checkpoints contain the resolved snapshot;
exported templates retain their editable source and selected challenge id.
The optional `courseTemplate.character.voiceStyle` field accepts `female` or
`male` for character-based reply playback. See
[voice selection](VOICE_LOOP.md#setup-and-use).
The desktop Training composition returns the selected bundled, imported or generated
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
