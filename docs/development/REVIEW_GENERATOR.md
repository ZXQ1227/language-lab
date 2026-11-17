# Review Generator: targeted follow-up training

Finish a lesson, then choose **Open targeted review**, or open **Review** in the
sidebar. New completions generate tasks automatically; an older report without a
plan offers **Generate targeted review**. Merely reading an old report never
writes tasks. Both AI and demo sources work offline for review generation and
practice; no provider credentials are required.

## Training flow

The queue shows pending tasks (due and upcoming), due tasks, practised tasks or
all tasks. Suggested dates are persisted, and upcoming tasks can be practised
early. Course title, language and difficulty remain attached to each source.
Selecting a task validates the original completed lesson without replacing the
active Training conversation.

1. Recall a correction from its highlighted original context, use an unused
   course word in a fresh reply, or answer a contextual course exercise.
2. Choose **Check my answer**. Correction checks compare normalized reference
   wording; a different answer is not automatically wrong. Vocabulary checks
   detect the term/accepted forms, not correct usage. Contextual answers require
   self-check against the scenario, goals, facts and optional authored example.
3. Optionally **Reveal example**. The attempt records this support; it is not
   presented as independent assessment.
4. Choose **Save and try tomorrow** or **Mark practised**. The former keeps the
   task pending with a date one day after the saved attempt; the latter records
   personal completion. Neither updates mastery or marks a diagnosis resolved.

Answers are limited to 2,000 characters. Saved history retains the latest ten
answers, support flags, checks and self-ratings alongside the total attempt count.
The report, original conversation, vocabulary/diagnosis observations, reflection
and course self-check answers remain separate. On a failed save, retry the same
save action to keep the draft. Queue read failures offer a retry button.

## Selection and contracts

`core/review.ts` defines typed tasks, progress, deterministic checks and source
validation. It groups short error suggestions by normalized category/original/
corrected pattern and distinct learner reply, then sorts by recurrence, impact
on meaning and source order. At most three short patterns are retained (original
up to 200 characters, corrected expression up to 160), preserving diagnosis
source/uncertainty. Up to three unused target terms of at most 120 characters
follow. The final task uses a bounded authored review exercise or a contextual
transfer fallback, so an otherwise clean lesson still has useful practice.

`skills.review_generator` version 0.2 accepts the completed state, transcript,
diagnoses and generation time. It replaces the unused 0.1 loose error/word input;
both registries share its schema-bound core rules. The orchestrator invokes it
before publishing completion. The legacy-generation operation writes no private
runtime state, and the desktop commits only a fully validated result.

Initial suggested intervals are one day for error recall, two for vocabulary and
three for context practice (24-hour days, not calendar-day boundaries). Stable
task IDs and idempotent generation preserve original dates and progress. These
rules are practice prompts, not an adaptive retention scheduler.

## Persistence and verification

Training stores `reviewPlan` version 1 and recomputes its immutable targets on
restore. The plan, canonical checkpoint and existing memory contribution save
atomically with the same SQLite statement. The queue reads validated plan mirrors
using learner/type filters and 100-row keyset pages, independently of the latest
50 resume checkpoints. A selected task and every attempt save re-read the
canonical lesson; progress is merged with its latest reflection/self-check data.

Future changes to deterministic version-1 target selection must preserve replay
compatibility or introduce a new plan version. No migration, new IPC command,
runtime dependency or change to the generic `review_tasks` table is required.

Tests:

- `tests/unit/desktop/review-generator.test.ts`: recurrence, source grounding,
  registry parity/no provider calls, truthful checks, restore validation,
  legacy/idempotent generation, bounded history and memory/evidence isolation.
- `tests/unit/database/targeted-review.test.ts`: real SQLite rollback of all three
  records, retry, restored attempts, pagination and learner isolation.
- `tests/e2e/review-generator.spec.ts`: final-save/attempt failure recovery,
  retrieval, example support, vocabulary production, restart, legacy generation,
  due dates, queue read retry and preservation of active practice.

Run `pnpm typecheck && pnpm lint && pnpm test`, `pnpm test:e2e` and
`pnpm --filter @language-lab/desktop build`.
