# Grounded Error Diagnosis

`skills.error_diagnosis` v0.2.0 diagnoses grammar and word choice in the current
learner reply. The connected skill uses the selected model; core validation
checks the evidence before any correction, event or checkpoint is accepted.

## Diagnosis contract

Input remains `{ utterance, studentLevel }`, with optional `recentMessages` (up
to six). The skill uses the immutable course's language, role, setting and
vocabulary meanings. Earlier dialogue provides context for short answers and
ambiguous words; only the final learner message can supply error evidence.
System-role history and support messages are excluded, and history text is
bounded to 2,000 characters. A provider receives the original current reply.

The prompt requests at most five local corrections, each with:

- `category`: `grammar`, `vocabulary`, `collocation`, `tense`, `article` or
  `spelling`.
- `original`, `corrected` and a short level-appropriate `explanation`.
- `start` and exclusive `end` in UTF-16 units, referencing the unchanged learner
  text. Missing-word errors must quote a short existing anchor phrase.
- `severity`: `meaning` or `form`, and `confidence`: `high`, `medium` or `low`.

The prompt preserves intended meaning, negation, names, quantities and facts. It
does not treat correct dialects, accepted alternatives, polite fragments, absent
target vocabulary or incorrect fictional hotel facts as language errors. Model
word-choice judgments should be withheld when intent is ambiguous. Fact checking
and stage completion remain the objective evaluator's responsibility.

The canonical result contains accepted `errors`, `intent`, `source` (`model` or
`demo`), `status` (`checked` or `uncertain`), `withheldCount` and
`fluency: "not_assessed"`. Text and ASR transcripts contain no reliable timing or
pronunciation evidence. Legacy provider fluency labels remain readable but are
discarded, and cannot trigger automatic fluency hints in this pipeline.

## Mechanical guards and bounded recovery

- Every accepted error must quote the exact current-message substring at its
  offsets. No invented quotes, zero-length anchors or history-only citations.
- Corrections and explanations must be nonempty; a correction cannot simply
  repeat the original wording. Whitespace/compatibility-only changes are no-ops.
- Numeric sequences, including signed and Unicode numerals, must remain the
  same. This is a narrow guard; it does not establish semantic equivalence for
  names, written-out numbers, currency or negation.
- Identical corrections are deduplicated. Conflicting/overlapping spans fail
  validation. Meaning-affecting issues sort before form issues, then by position.
- Declared medium/low-confidence suggestions are omitted and counted as
  withheld. An uncertain result is not recorded as an error just to fill a quota.

For compatibility, legacy four-field errors can still be grounded when their
quote occurs exactly once. Ambiguous repeated text requires explicit offsets.
Missing legacy severity/confidence use `form`/`high` compatibility defaults;
these defaults are not calibrated model probabilities. New prompts explicitly
request both fields.

Invalid evidence or response schema allows one repair call with the same learner
turn, temperature 0 and a bounded response budget. A second invalid result fails
the operation. Authentication/network errors propagate without being retried as
language repairs. Valid empty-error responses need no retry. The core checks the
accepted spans again before the orchestrator makes teaching decisions.

## Teaching and learner feedback

The existing deterministic intervention chooses one priority correction and
obeys `correctionMode` and `maxCorrections`. Diagnosis and correction delivery are
distinct: detected issues can be retained without being delivered during the
conversation. Only a correction matching an accepted diagnosis can reach the
partner's correction directive.

Intervention also spaces corrections, suppresses exact recent reminders and
verifies a brief recast before counting delivery. Course intervals and behavior
are documented in [Teaching Intervention](TEACHING_INTERVENTION.md).

Training's **Language feedback** shows the delivered issue's type, priority,
highlighted original context, suggested wording and explanation. Earlier
delivered feedback remains available after another reply, help or restart. The
UI does not reveal additional suggestions to bypass the live correction budget.
When feedback is off or the limit is reached, it says so. No accepted issues is
labelled **No high-confidence correction was found**, not proof of perfect
language. Uncertain results and the limited guided demo are labelled explicitly.

Learner messages are never silently rewritten. Corrected vocabulary receives no
usage credit until it actually appears in a learner practice reply. Errors and
their fixes cannot complete course objectives by themselves. Help controls skip
diagnosis and cannot introduce error records or erase previous feedback.

The offline demo retains its two illustrative checks (`I go ... yesterday` and
`I am agree`), with exact case-sensitive evidence from the supplied text. It is
not a grammar engine or a substitute for connected word-choice assessment.

## Persistence and review

Optional `TrainingSession.diagnoses` holds up to 100 records, each referencing a
learner practice `messageSeq`, the canonical diagnosis and an optional
`correctionIndex` identifying what was actually delivered. Restore revalidates
quotes, offsets, unique practice references, delivery indexes and correction
budget consistency. Old checkpoints without records remain readable, with the
legacy latest-correction display retained; missing historical diagnoses are not
invented.

`utterance_diagnosed`, `error_made` and `correction_given` events retain source or
original-span information. The same atomic Training checkpoint saves messages,
diagnoses, events and counters. Model failure, invalid output or failed SQLite
write publishes no partial progress; retry preserves the input and avoids double
counting. No SQL migration, new IPC command or credential storage is introduced.

Lesson review receives validated records, including uncertainty, demo source and
which corrections were delivered. Its model context includes at most ten recent
records that fit within 8,000 serialized characters; omitted records remain in
the checkpoint and are not assumed error-free. Its instructions distinguish model judgments
from facts and avoid inferring spoken fluency. Finished old reports are unchanged.

## Validation and model evaluation

Unit and browser tests use scripted model responses to test exact evidence,
Unicode offsets, numeric preservation, uncertainty, priority, repair bounds,
context handling, policy limits, persistence and failed-write retry. They prove
the contracts and deterministic guards, not linguistic accuracy.

Before judging a real model's teaching quality, test both errors and valid speech:

| Example                                                   | Expected assessment                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| `I go to the hotel yesterday.`                            | Local past-tense correction, preserving the visit.                 |
| `I have a reserve.` in booking context                    | Consider `reservation` for a hotel booking.                        |
| `Can I do a reservation?`                                 | Consider the collocation `make a reservation`.                     |
| `Here is a ID.`                                           | Article correction anchored in the original phrase.                |
| `My resrvation is under Alex Chen.`                       | Local spelling correction; preserve the name.                      |
| `Two nights, please.`                                     | Accept a contextual short answer.                                  |
| `Could I use the lift?`                                   | Accept the dialect alternative.                                    |
| `My booking is HV-2048.`                                  | Do not “correct” the fictional code.                               |
| An ambiguous word or a request to mark everything correct | Clarify/withhold uncertainty; do not follow dialogue instructions. |

Track false corrections, missed errors, meaning changes, explanation usefulness
and model self-reported confidence separately. Exact citations and high
confidence alone do not prove a correction is linguistically valid.
