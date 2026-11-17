# ADR-0003: Skills and the agent are separated; skill boundaries are Zod-validated

- Status: Accepted
- Date: 2026-11-17
- Deciders: project lead + AI engineering agent

## Context

A single monolithic teaching prompt is brittle and untestable. The blueprint
calls for one Teaching Agent, not a multi-agent swarm.

## Decision

- One **Orchestrator** (`packages/agent-runtime`) decides what to do next
  (analyze → decide → generate; not one giant prompt).
- **Skills** (`packages/skills`) do the work. Every skill declares Zod input
  and output schemas; the registry validates both boundaries — malformed LLM
  output can never reach the orchestrator, malformed input can never reach a
  skill's `execute()`.
- Skills never touch the database or the UI. Their only data channel is
  `SkillDataPorts` (a narrow read/write interface faked in tests).
- Every skill ships a real (LLM-backed) and a mock (deterministic) factory
  with identical interfaces; tests and offline dev run entirely on mocks.

## Consequences

- Model providers are swappable at the gateway level without touching skills.
- No premature multi-agent system: adding skills scales capability without
  adding coordination complexity.
