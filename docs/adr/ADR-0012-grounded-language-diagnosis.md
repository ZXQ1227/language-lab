# ADR-0012: Ground language diagnosis before correction delivery

- Status: Accepted
- Date: 2026-11-17
- Deciders: project lead + AI engineering agent

## Context

The first diagnosis skill accepted any strings as corrections and used text-only
fluency labels to trigger scaffolding. Only one transient correction was visible;
its citation and relationship to delivered feedback were not persisted or checked.
Model judgments need conservative handling without pretending to be deterministic
grammar truth.

## Decision

- Keep linguistic diagnosis in the model skill and mechanical citation validation
  in the core. Accept bounded local corrections with types, priority, confidence
  and exact UTF-16 evidence from the current learner reply.
- Withhold declared lower-confidence suggestions, deduplicate identical fixes,
  reject conflicts/no-ops/numeric rewrites and retry invalid results at most once.
  Keep unique legacy quotes readable with documented compatibility defaults.
- Treat textual/transcribed fluency as `not_assessed`; no automatic fluency hint
  is derived from grammar errors. Existing explicit help and hint budgets remain.
- Keep diagnosis separate from deterministic correction delivery. Preserve the
  lesson's correction switch and budget, focus on one issue and verify the chosen
  correction belongs to the validated diagnosis.
- Persist optional per-practice diagnosis records and delivery references in the
  existing atomic Training checkpoint. Revalidate on restore and supply them to
  review; do not reconstruct missing old records or alter learner text.

## Consequences

- Feedback survives help, another turn and restart with auditable source text.
  Failed calls/writes preserve the previous checkpoint and allow retry.
- Source, uncertainty and delivered feedback remain distinct. Demo checks are
  explicitly limited; live model teaching quality needs separate evaluation.
- Citations and numeric guards cannot establish semantic correctness or perfectly
  preserve intended meaning. Confidence is a model declaration/legacy default,
  not a verified probability.
- No database migration, service, native command or dependency edge is added.
