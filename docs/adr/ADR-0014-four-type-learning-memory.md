# ADR-0014: Four-type memory from explicit profiles and atomic lesson contributions

- Status: Accepted
- Date: 2026-11-17
- Deciders: project lead + AI engineering agent

## Context

Memory had interfaces only. Training supplied course defaults as profile data,
current-lesson vocabulary as knowledge, and empty error/episode arrays. Independent
updates to normalized memory rows and checkpoints would risk partial progress,
retry inflation and treating guided use as mastery.

## Decision

- Validate four-type memory at the package boundary. Write explicit profile edits
  atomically to the existing profile row; never infer level, goals or identity
  from roleplay.
- Derive knowledge/error observations and episode facts from validated Training
  sources. Keep provenance, exact source references and guided/model distinctions.
  Automatic vocabulary states are only new/learning; historical diagnoses do not
  establish ongoing mistakes or resolution.
- Save a versioned lesson contribution in the checkpoint and its compact
  projection row with a single multi-row UPSERT. Publish neither partially.
  Rebuild global memory by replacing contributions per lesson, not incrementing
  counters on each save.
- Read all sources with learner/type filters and keyset pagination, separately
  from the latest-50 resume list. Derive legacy sources without rewriting them;
  upgrade on their next successful checkpoint save.
- Provide a learner-visible Memory page and source opening. Supply a bounded,
  language-scoped historical view to teaching, while keeping course facts,
  criteria and delivery policies authoritative.

## Consequences

- Memory survives sessions/restart and supports audit without replay inflation.
  A failed profile or paired lesson write keeps the previous saved data.
- No SQL migration, cloud service, new IPC command or runtime native/Node driver
  is required. Existing independent normalized knowledge/error tables are retained.
- Checkpoints remain the source of truth for Training observations; the memory
  projection is committed with that source, not an independently mutable score.
- Real SQLite failure injection verifies atomicity. Linguistic/model quality and
  genuine mastery require separate assessment; this memory layer does not infer
  either from counts.
