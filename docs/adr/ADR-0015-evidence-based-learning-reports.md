# ADR-0015: Evidence-based lesson reports and personal reflection

- Status: Accepted
- Date: 2026-11-17
- Deciders: project lead + AI engineering agent

## Context

Training showed a model score and free-text advice after completion, while Reports
was a placeholder. Those comments did not expose the saved goal, vocabulary and
diagnosis evidence, and a score could be confused with independent proficiency.

## Decision

- Build a versioned deterministic report in core from the completed course
  snapshot, learner transcript, stage assessments and diagnosis records. Replay
  lexical observations; exclude assistant and support messages from practice.
  Preserve exact citations and distinguish recorded correction flags from the
  newer verified delivery contract.
- Save the report with the completed checkpoint and memory contribution through
  the existing atomic UPSERT. On restore, recompute and validate its facts and
  practice tasks. Keep its generation time stable across later reflection and
  course self-check saves. Future algorithm changes must preserve the version-1
  replay contract or introduce a new report version.
- Reconstruct reports for legacy completed checkpoints on read, without a silent
  rewrite or an invented completion time. Missing diagnosis coverage remains
  unknown, never proof of error-free language.
- Generate up to five concrete next tasks from observed correction suggestions,
  unused vocabulary and authored review material, with source references and
  optional examples. These are practice suggestions, not mastery or SRS events.
- Keep model commentary separate and collapsed, label its score as subjective,
  bound newly generated text, and prohibit proficiency, oral-fluency or invented
  longitudinal-progress claims. Keep old four-field model reports readable.
- Provide completed-report history using all episode sources, beyond the latest
  50 resume checkpoints. Detail reads and reflection saves do not activate a
  different Training session. Source opening and starting another attempt are
  explicit learner actions.
- Save bounded personal reflection separately from teaching evidence. Merge it
  into the latest validated checkpoint to retain course self-check answers, and
  publish only after checkpoint and memory both save successfully. Reflection
  does not change report facts, grades, observed counts or the stated profile.

## Consequences

Reports survive restart, expose their basis and offer actionable practice. Failed
model generation or checkpoint writes leave the debrief retryable; failed
reflection writes retain the saved report and the editor's draft. No SQL
migration, new IPC command, workspace dependency edge or native driver is needed.
Exact citations verify provenance, not the correctness of a model's linguistic
judgment. Guided examples remain explicitly distinct from independent assessment.
