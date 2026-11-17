# ADR-0013: Space gentle corrections and verify delivery

- Status: Accepted
- Date: 2026-11-17
- Deciders: project lead + AI engineering agent

## Context

The intervention chose the first error whenever budget allowed, without spacing
or repeated-reminder control. A correction directive could increment counters
even when the partner omitted the corrected expression. Full explanations also
competed with scene practice.

## Decision

- Share deterministic timing/selection rules in the core. Retain hard lesson
  limits and verified completion, choose one short issue and expose deferral
  reasons.
- Default to one intervening practice reply between corrections and four before
  the same exact correction. Add optional course intervals (0–10). Support does
  not advance them; exact keys do not infer equivalent grammar patterns.
- Persist bounded versioned timing in lesson state and validate Training history
  against transcript and recorded deliveries. Hydrate old known history privately
  without resetting budgets or inventing unknown deliveries.
- Supply one structured approved correction to dialogue. Require its wording in
  a reply bounded to 600 UTF-16 units, allow one combined repair and check again
  before counting delivery. Make explanations optional while dialogue continues.
- Commit timing, decision, reply and count through the existing atomic checkpoint.
  Failure publishes no partial learning state.

## Consequences

- Timing survives help and restart. Repeated wording does not repeatedly
  interrupt practice by default. Long or temporarily deferred issues remain
  observations; original text and objective evidence are unchanged.
- Additive optional fields preserve old courses/checkpoints. No native commands,
  migrations, service or dependency edges are added.
- Bounds and expression presence do not prove semantic or pedagogical quality.
  Natural conversation and diagnosis quality need separate live-model review.
