# ADR-0016: Source-grounded follow-up practice with atomic review progress

- Status: Accepted
- Date: 2026-11-17
- Deciders: project lead + AI engineering agent

## Context

Review Generator was an unused rule sketch with untyped payloads. Reports offered
suggestions but no saved retrieval practice, answer checking, queue or attempt
history. Independently writing tasks after completing a checkpoint would risk
partial completion and duplicate tasks on retry.

## Decision

- Replace the unused skill contract with version 0.2: a completed course snapshot,
  transcript and validated diagnosis records produce a typed version-1 review
  plan. Both real and demo registries call the same deterministic core generator;
  generation does not use a provider or keys.
- Prioritize up to three recurring/meaning-affecting short error patterns, up to
  three unused target words and one authored contextual exercise or transfer
  fallback. Preserve source messages, original spans, uncertainty, accepted word
  forms, course language and difficulty. Do not infer new weaknesses from partner
  replies, support controls, missing checks or vocabulary counts alone.
- Use stable per-lesson task IDs and suggested initial intervals of one, two and
  three elapsed days by task kind. Explicit "try again" schedules another attempt
  one elapsed day later. "Practised" completes the task as a self-report, not a
  correctness, retention or mastery assessment. These are simple practice dates,
  not an adaptive SRS model.
- Store the canonical plan and personal attempts in the completed Training
  checkpoint. Co-commit checkpoint, memory contribution and a
  `targeted_review_plan` queue mirror in one multi-row UPSERT in `learning_events`.
  Keep the existing generic `review_tasks` table untouched; its untyped rows are
  not automatically reinterpreted as verified source-linked tasks. No migration
  or additional IPC transaction mechanism is needed.
- Recompute immutable tasks against the course source on restore. Validate saved
  checks, task identities, attempt order and due/status state. Retain the latest
  ten answers plus a total attempt count. A repeated generation preserves the
  existing plan and progress; legacy completed lessons generate only on explicit
  action, without a silent data rewrite.
- Read queue mirrors by learner/type with keyset pagination beyond the resume
  window. Before opening or saving an attempt, load and validate the canonical
  source. Merge attempts into the latest checkpoint, preserving reflection and
  independent course-review answers. Browsing/practising review does not activate
  another Training session.
- Provide retrieval before optional example reveal, bounded answers, reference
  comparison for short corrections, lexical matching for vocabulary, and manual
  self-check for contextual production. Record example support honestly. These
  checks cannot grade grammar, meaning or proficiency; review answers do not
  rewrite original lesson evidence, memory observations or model commentary.

## Consequences

Completed lessons now lead to durable targeted practice and a due/upcoming/done
queue. Failed final/attempt writes roll back all three records, retaining the
previous checkpoint and the editor draft. Source opening, legacy generation and
read failures have explicit UI paths. Real SQLite tests verify atomicity and
pagination; no new workspace dependency edge, cloud service, native driver or
runtime package is introduced.
