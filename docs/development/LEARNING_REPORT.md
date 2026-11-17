# Learning Report: post-lesson review

Complete the course stages and choose **Finish and review**. Training and Reports
share the same report view:

- Practice/help/hint counts and goal criteria with expandable exact learner quotes.
- Target-word coverage, practice-turn/match counts and the original usage context.
- Diagnosis coverage, uncertainty and withheld-suggestion counts; corrections with
  explanation, original context, source and delivery status. Missing legacy checks
  are unknown. A displayed correction is not evidence that an issue was learned.
- Up to five next tasks: two distinct observed correction suggestions, two unused
  target words, and one authored course review exercise (or a transfer exercise).
  Examples are optional reveals; no answers are graded automatically.
- Separately labelled model commentary for AI lessons. Its collapsed score is a
  subjective estimate, not proficiency or measured improvement. Guided demos show
  no score and explicitly describe supported performance.

For saved follow-up tasks, answer checks, due dates and attempt history, choose
**Open targeted review** (or **Generate targeted review** for a legacy source).
See [Review Generator](REVIEW_GENERATOR.md). These personal review attempts remain
separate from the evidence and static next-practice suggestions in this report.

Reports lists completed episodes across all saved sources, with mode filtering
and progressive display. It reads a checkpoint by exact lesson ID; browsing and
reflection never switch the active Training session. **Open source lesson** opens
the saved conversation. **Practise this course again** prepares a new attempt
using the saved course configuration; the learner still chooses Start lesson.

The reflection form stores a personal note (2,000 characters) and a next-practice
commitment (500 characters). These are self-reported text, not assessment data,
and are not added to teaching prompts. A failed write preserves the editor draft;
retry Save reflection. Saved course self-check answers are retained.

## Storage and validation

`core/learning-report.ts` derives `learningReport` version 1. Training stores it
alongside the existing `report` model commentary, optional `reportReflection`,
transcript, state and memory contribution. The checkpoint boundary recomputes the
report to reject mismatched counts, citations and tasks. Reflection/self-check
saves retain the original report timestamp and report evidence.

The existing checkpoint/memory multi-row SQLite UPSERT makes completion and
reflection atomic. No separate report table or migration is necessary. Global
episode contributions supply history beyond the latest-50 resume window, and the
full source is loaded only when selected. Legacy reports are reconstructed in
memory and labelled accordingly; read-only browsing does not rewrite them.

## Verification

`tests/unit/desktop/learning-report.test.ts` covers source evidence, support
exclusion, legacy checks/delivery, task selection, forged snapshots, reflection
bounds, self-check retention and failed model generation/retry.
`tests/e2e/learning-report.spec.ts` covers empty/history/detail states, final-save
and reflection rollback/retry, restart, source opening, mode filtering, older
reports and preservation of the active conversation. Existing real SQLite tests
verify the shared checkpoint/memory atomic UPSERT.

Run `pnpm typecheck && pnpm lint && pnpm test`, then `pnpm test:e2e` and
`pnpm --filter @language-lab/desktop build`.
