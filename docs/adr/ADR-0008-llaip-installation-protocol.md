# ADR-0008: LLAIP — AI-agent installation protocol over GitHub Releases

- Status: Accepted
- Date: 2026-11-17
- Deciders: project lead + AI engineering agent

## Context

The product's install experience is: user downloads from GitHub and asks their
AI coding assistant (Codex, Claude Code, …) to set the app up on their machine.

## Decision

- `docs/installation/AI_INSTALL.md` defines **LLAIP** (Sayden AI
  Installation Protocol): a structured, machine-readable checklist an agent
  follows to verify OS requirements, download the right release asset, run
  first-launch checks (DB created, migrations applied, health check green),
  and record the installed version.
- Distribution is prebuilt installers from GitHub Releases — no end-user
  executable install scripts in the repo (AGENTS.md constraint).

## Consequences

- Installation quality is only as good as the release artifacts, which makes
  the Desktop Build workflow and (later) signing prerequisites, not niceties.
- The protocol must stay agent-agnostic: plain markdown, verifiable steps,
  no vendor-specific tooling required.
