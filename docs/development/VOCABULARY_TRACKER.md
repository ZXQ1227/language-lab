# Deterministic Vocabulary Tracker

`skills.vocabulary_tracker` v0.2.0 observes learner production of the course's
target vocabulary. Both factories use the same pure matcher in `packages/core`;
neither calls a model, dictionary service or database. Existing `used` and
`missed` arrays remain, with an additional `matches` array of original evidence.

## Matching policy

- Apply Unicode NFKC, lowercase, canonical Greek sigma and straight/curly
  apostrophe equivalence. Accents remain significant. Compatibility characters
  such as full-width letters match without changing the saved utterance.
- Treat whitespace runs and ASCII/non-breaking/Unicode hyphens (`-`, U+2010,
  U+2011) as equivalent phrase separators. `check-out`, `check out` and
  `check‑out` match the same target. Other punctuation remains literal: a phrase
  cannot bridge `oat. Milk` or `check, out`.
- Require Unicode letter/mark/number/underscore boundaries. Contractions are
  whole lexical units: `can` does not match `can't`, and `latte` does not match
  `lattes`, `latte_shop` or another longer word.
- Match additional inflections or expressions only when explicitly authored.
  There is no inferred stemming, synonym expansion, typo correction, fuzzy
  matching or non-whitespace-language word segmentation.
- Treat terms as literal text, including regex characters such as `C++`.
  Deduplicate equivalent targets and forms. For overlapping forms of one target,
  choose leftmost, then longest. Distinct targets may share text (`room` and
  `quiet room`) and each receives its own observation.

Each match contains `{ term, form, quote, start, end }`. `term` is the canonical
authored target, `form` identifies the accepted expression, and `quote` is the
exact original substring. Offsets are UTF-16, with an exclusive `end`, so
`utterance.slice(start, end) === quote` even with emoji, combining marks and
length-changing normalization. A match never cuts a normalized source grapheme
in half.

## Authoring accepted forms

Complete course packs may add optional `forms` (up to eight nonempty expressions,
each at most 120 characters) to a vocabulary entry:

```json
{
  "term": "key card",
  "forms": ["key cards"],
  "meaning": "a card used to open your hotel room",
  "translation": "房卡",
  "example": "Thank you for the key card."
}
```

All forms map to the entry's canonical term. The content schema and skill reject
forms that belong to another target or give one expression to different terms.
Course JSON import/export and immutable snapshots preserve them. Older packs
without `forms` keep exact matching with the normalization rules above.

Hotel Check-in includes reviewed plurals, `identification` for `ID`,
`include`/`includes` for `included`, checkout verb forms, and `lift` for `elevator`.
The study pack and progress panel expose the accepted expressions to learners.
Custom packs can author their own forms in JSON; no model can add forms at runtime.

## Counting and evidence

`LessonState.vocabularySeen` counts **practice turns** containing a target: saying
`deposit` three times in one reply adds one turn, not three. A later reply adds
another turn. Counter updates also deduplicate input to prevent inflated counts.
`vocabulary_used` events carry the canonical word, message sequence and matched
spans. Assistant/system text and `purpose: support` messages never contribute.

Training's **Vocabulary progress** panel shows coverage, practice-turn counts,
occurrence counts and highlighted latest evidence, together with meanings and
examples when available. It is available during practice and after review, and
recomputes from the saved transcript after restart. Unused words are labelled
**Not used yet**, not errors or proven unknown words.

Lexical use does not establish correctness, comprehension or independent
mastery. Quoted or negated use still counts as an observation. Guided replies are
supported practice and are labelled accordingly. Course objectives retain their
separate criterion/evidence evaluation; a word match cannot complete them. The
final review receives the same counts with this limitation explicitly stated.

## Persistence and compatibility

New Training checkpoints include optional `vocabularyTrackingVersion: 1`, which
pins these rules. Restore recomputes counts against actual learner practice and
rejects inconsistent versioned totals. Evidence is derived from transcript text,
not copied from provider output or a separate mutable word list.

Legacy checkpoints without the marker remain readable. The next turn or lesson
review replays their transcript using these rules in a private draft. The marker
and corrected counts are committed with the existing atomic checkpoint; a
model/write failure leaves the old checkpoint intact. Historical append-only
events and completed reports are not rewritten. No SQL migration or new IPC
command is required. Cross-lesson mastery and spaced repetition are separate work.

## Verification

Unit tests cover lexical boundaries, Unicode normalization and original offsets,
literal punctuation, explicit forms, duplicates/overlaps, support exclusion,
counter semantics, content validation, legacy upgrades and corrupt restore.
Playwright covers visible evidence and aliases, restart persistence, hint/repeat
exclusion and failed-write retry without double counting. Real and offline
factories run without model or data ports; recognition does not depend on model
behavior.
