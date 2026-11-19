# ADR-0021: Order the bundled starter library by learning goal

- Status: Accepted
- Date: 2026-11-19

## Decision

- Define the bundled catalog's five learning paths and lesson order in
  `content/starter-catalog.json`. Each shipped lesson must appear once and
  specify a topic for its cover and label. Each path shows all matching lessons
  in catalog order in a horizontally scrollable row. The same order is used for
  recommendations and synchronization.
- Read the bundled library from validated static content so the first
  library visit can show courses while SQLite seed synchronization runs.
  Keep the existing metadata projection and retain visibility of additional
  scenarios already in the local database.
- Use the existing course, study pack, guided practice and lesson checkpoint
  formats. New starter lessons work with offline guided replies and connected
  AI. Bilingual expression translations and language notes are optional
  additions to version 1 content. English remains the practice language.
- Use catalog order to break ties among suitable recommendations. Prefer
  the learner's target language and level and prioritize unfinished options
  at the same level. The default A2 recommendation begins with airport check-in.
- Use the authored CEFR level for a single library filter across scenario
  dialogues, guided practice and listening. Derive each path's count from its
  matching lessons and show each lesson's level on its card.
