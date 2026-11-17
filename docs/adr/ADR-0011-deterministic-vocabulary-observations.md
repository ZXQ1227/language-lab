# ADR-0011: Deterministic vocabulary observations and replayable counts

- Status: Accepted
- Date: 2026-11-17
- Deciders: project lead + AI engineering agent

## Context

The first tracker used ASCII-style word-boundary regexes and literal spaces.
It returned word lists without citations, missed authored plurals and formatting
variants, and had no learner-visible evidence. Duplicate counter input could
inflate vocabulary counts. Lexical production also needs to remain distinct from
mastery and criterion completion.

## Decision

- Keep tracking deterministic in a pure core matcher, shared by real/offline
  skills, transcript replay and Training display. Preserve `used`/`missed` and add
  exact original spans. No model or dictionary dependency is introduced.
- Normalize compatibility characters, case, apostrophes and phrase whitespace/
  hyphens; use Unicode lexical boundaries. Preserve accents and punctuation.
  Additional inflections/expressions require explicit authored course forms;
  reject ambiguous mappings between target terms.
- Count a target at most once per learner practice turn, with occurrence counts
  and latest evidence derived separately. Exclude partner/system/help text.
  Lexical observations do not establish correctness or mastery.
- Store an optional matcher-version marker in the existing Training checkpoint.
  Verify new counts by replay on restore; upgrade old counts in a private draft
  at the next successful operation. Continue the existing atomic persistence
  policy and immutable content snapshots.

## Consequences

- Learners can inspect exactly what was recognised and why, and retry failed
  saves without duplicated counts. Existing source formats and checkpoints remain
  readable; old snapshots receive no newly shipped forms implicitly.
- Explicit forms require author review and avoid accidental stemming or fuzzy
  matches. Whitespace-free language segmentation and semantic assessment remain
  outside this matcher.
- No SQL migration, native command, service or dependency edge is added.
- Changes to the recognition policy require an explicit future version strategy;
  historical append-only events and finished reports are preserved.
