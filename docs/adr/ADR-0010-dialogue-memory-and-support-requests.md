# ADR-0010: Grounded dialogue memory and separate support requests

- Status: Accepted
- Date: 2026-11-17
- Deciders: project lead + AI engineering agent

## Context

Reply generation had a fixed role prompt and a small recent-message window.
Earlier learner preferences could disappear; stage changes lacked explicit
previous-task context. Functional help requests could also be mistaken for
practice, and identical generated replies had no bounded recovery.

## Decision

- Add an optional authored character profile and cited learner memory to the
  existing single-agent pipeline. No additional agent or model provider is added.
- Memory consists of exact learner quotes, not inferred authoritative facts.
  Validate references, preserve complete short statements and reject stale
  replacements. Persist at most 12 details in the existing lesson checkpoint.
- Bound recent reply context to 20 messages and 8,000 message-text characters.
  Keep dialogue roles; exclude system-role history. Pass stage transition context
  and known facts explicitly to reply generation.
- Treat explicit help controls and a small recognised set of standalone English
  requests as `purpose: support`. The orchestrator decides the action before
  generation, enforces hint budgets and skips assessment for these exchanges.
  Core evidence validation and review exclude support messages.
- Return exact repeat without a model call. Rephrase with connected AI for
  simpler English. Guided examples retain their explicitly limited behavior.
- Retry an accidental duplicate once; failure, invalid memory or failed
  checkpoint writes publish no partial progress. The original reply/tone output
  and old checkpoints remain compatible.

## Consequences

- Conversation context survives restart and extends beyond the recent-history
  window, with an auditable source for each remembered statement.
- Help cannot complete objectives or silently bypass hint quotas. It still uses
  an exchange slot in the existing 100-exchange transcript limit.
- Persistence remains the existing atomic checkpoint; no Rust or database
  migration is required. Credentials continue using the established keyring path.
- Deterministic guards do not establish model teaching quality. Live-model
  adherence and conversational naturalness require separate evaluation.
