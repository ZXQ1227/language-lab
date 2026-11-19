# ADR-0019: Design AI courses before starting the lesson

- Status: Accepted
- Date: 2026-11-19

## Context

Shipped course packs provide a reliable first lesson and a guided offline
experience. A learner with a configured model needs to practice situations
beyond the shipped catalog, while retaining observable objectives, feedback,
reports and follow-up review.

## Decision

- Offer on-demand generation in the scenario section of the course library
  once AI settings are saved.
  The learner supplies a goal. The request includes that goal, the learning
  language and profile level, and a fixed lesson length. It carries no
  transcripts, learning evidence or identifiers.
- A Course Designer skill runs before a lesson exists. Its registry context
  requires the Model Gateway and can carry a cancellation signal. It has no
  repository ports. It asks the model for bounded teaching material, with an
  observable learner objective and success criteria for each step.
- Validate the model payload, assign identity and objective references in code,
  apply a bounded teaching policy, and validate the resulting version 1 course.
  Show the result through the existing preview. Starting is a separate action
  and the existing teaching engine owns the session and all progress.
- Shipped courses stay available on the plan and in the library. Generating
  happens only on request. Rejected or failed generation leaves the learner free
  to retry or open a shipped course. Started lessons retain the normal local
  course snapshot for resuming and review.

## Consequences

There is one Teaching Orchestrator. A draft is temporary before starting, and
there is no generated catalog or automatic multi-lesson plan in this slice.
Schema validation covers structure and references. The learner can inspect the
generated material before using it.
