# Gentle Teaching Intervention

`skills.teaching_intervention` v0.2.0 makes a deterministic decision from
validated diagnosis, lesson policy and correction history. Real and offline
factories share the core rules; neither calls a model. The partner model supplies
natural scene language, not correction timing.

## Timing and selection

Verified completion closes the scene without another correction. Otherwise the
teacher respects the correction switch and hard budget (legacy default: three).
It leaves **one intervening learner practice reply** between corrections by
default: replies 1 and 3 may be corrected while reply 2 continues the conversation.

Only short local fixes are eligible: original and corrected expressions must each
fit within 160 UTF-16 units, before and after normalization. Longer rewrites stay
diagnosis observations. Exact recently delivered original/corrected pairs wait
**four intervening practice replies** by default. Matching normalizes case,
compatibility characters, whitespace and apostrophes; it does not infer equivalent
grammar patterns or mastery. Among eligible issues, meaning takes priority over
form, followed by source position. A different issue can be selected when the
first was recently corrected. Only one issue is delivered per reply.

The decision records why it corrected or continued: `correct_error`,
`correction_spacing`, `recently_corrected`, `not_lightweight`, `corrections_off`,
`budget_exhausted`, `no_errors` or `objectives_complete`. The existing explicit
support path and legacy scaffolding reason remain separate. Text diagnosis is
still `not_assessed` for spoken fluency; it does not generate fluency hints.

## Course configuration

Two optional fields extend `courseTemplate.teachingPolicy`:

| Field                           | Default | Meaning                                               |
| ------------------------------- | ------- | ----------------------------------------------------- |
| `correctionCooldownTurns`       | 1       | Practice replies between corrections.                 |
| `repeatCorrectionCooldownTurns` | 4       | Practice replies before repeating the same exact fix. |

Both are integers from 0 to 10; the repeat interval is at least the general
interval. Zero for both permits consecutive reminders within the hard budget.
Scenarios configuration exposes both fields. Course JSON export/import and
immutable lesson snapshots preserve them. Old courses receive the defaults
without file edits. Help exchanges do not consume the interval: several repeat
requests cannot cause a new correction. Clean and deferred practice replies do
advance it.

## Brief recast and conversation continuation

The orchestrator supplies exactly one structured, citation-validated correction
to Dialogue Roleplay. The partner is instructed to give a friendly recast, then
answer the learner's intended meaning and direct questions and continue the
scene. It must not read error categories, deliver a grammar lecture, add other
corrections or demand sentence repetition before continuing.

A correction reply must fit within 600 UTF-16 units and contain the approved
corrected expression under the existing Unicode-aware lexical matching rules.
Missing wording or an overlong reply permits one combined delivery/duplicate
repair with the same learner turn. A second invalid reply fails without counting
delivery. The orchestrator checks again even for custom/mock skill output; a
directive or successful model call alone cannot consume a correction slot.

The guided demo inserts a brief recast before its reviewed scene prompt; it is
still a limited demonstration. Exact repeat returns the saved whole reply without
another correction. Original learner text is never rewritten, and only actual
practice text contributes to vocabulary observations and objective evidence.

Training's per-reply feedback distinguishes spacing, recent reminders, long
rewrites and budget deferral. **Suggestion** opens the highlighted original,
revised wording and explanation on the learner's source message. Earlier
delivered feedback remains available after another reply, help and restart.

## Persistence and compatibility

Optional `LessonState.interventionState` version 1 records practice-turn count
and up to 20 ordered delivery marks. Each mark has a practice position and
normalized original/corrected key. State validation checks positions against
lesson counters. Training reconstructs the state from transcript and recorded
deliveries and rejects inconsistent history.

New diagnosis records have an `interventionReason`. A delivered reason must
reference an accepted error and a following brief partner reply containing its
fix. Support controls cannot create diagnosis records. The
`teaching_intervention_decided` event records reason/action separately from
observed errors and actual corrections.

Old checkpoints remain readable. Their next operation seeds known practice and
deliveries in a private draft, preserving existing correction totals and remaining
budgets. An old long rewrite contributes to spacing with a bounded legacy marker.
Unknown historical deliveries are not invented. The existing atomic checkpoint
commits timing, reply, reason and counters together; failed generation/writes use
neither a correction nor a practice slot. No SQL migration or new IPC is required.

## Verification and limits

Tests cover priority, spacing, exact repeats, long-fix deferral, help exclusion,
legacy hydration, policy boundaries, delivery proof and bounded repair. Browser
tests exercise recasts, optional explanations, restart, interval export/import,
failed-write retry and a connected transport that omits a recast before repair.
Provider responses and native IPC are mocked.

Timing, word presence, limits and atomicity are deterministic. Presence does not
prove a recast is natural, semantically correct or the only correction in a reply.
Preserving intended meaning, answering questions and staying in character need
live-model evaluation; grammar accuracy remains an Error Diagnosis concern.
These checks do not establish mastery.
