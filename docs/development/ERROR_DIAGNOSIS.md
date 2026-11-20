# Grounded Error Diagnosis

`skills.error_diagnosis` v0.3.0 diagnoses grammar and word choice in the current
learner reply. The connected skill uses the selected model; core validation
checks the evidence before any correction, event or checkpoint is accepted.

## Diagnosis contract

Input remains `{ utterance, studentLevel }`, with optional `recentMessages` (up
to six). The skill uses the immutable course's language, role, setting, current task and
vocabulary meanings. Earlier dialogue provides context for short answers and
ambiguous words; only the final learner message can supply error evidence.
System-role history and support messages are excluded, and history text is
bounded to 2,000 characters. A provider receives the original current reply.

The training prompt requests up to five actual errors. For accurate replies, it can
return one optional expression improvement with a concrete benefit in the current
context. Both kinds of edits use these fields:

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
`fluency: "not_assessed"`. An optional `improvement` holds one grounded edit
with a concrete contextual benefit, such as fitting a polite request. Saved
turns also carry an optional `assessedAt` timestamp. Text and ASR transcripts contain no reliable timing or
pronunciation evidence. Legacy provider fluency labels remain readable but are
discarded, and cannot trigger automatic fluency hints in this pipeline.

## Mechanical guards and bounded recovery

- Every accepted error must quote the exact current-message substring at its
  offsets. No invented quotes, zero-length anchors or history-only citations.
- Corrections and explanations must be nonempty; a correction cannot simply
  repeat the original wording. Whitespace/compatibility-only changes are no-ops.
- Numeric sequences, including signed and Unicode numerals, must remain the
  same. Common English time expressions, AM/PM and spelled booking quantities
  are also checked. Capitalization and surrounding punctuation alone do not
  count as spoken wording changes.
- For English, compare explicit negation and negative modal markers in the
  learner's full reply before and after applying the cited change. Withhold
  polarity shifts and edits that only swap equivalent written forms such as
  `cannot` and `can't`. Retain a grounded grammar or word-choice correction
  alongside a withheld suggestion. The marker check covers explicit forms and
  leaves wider questions of intent and negation scope to contextual judgment.
- Identical corrections are deduplicated. Conflicting/overlapping spans fail
  validation. Meaning-affecting issues sort before form issues, then by position.
- Declared medium/low-confidence suggestions are omitted and counted as
  withheld. An uncertain result is not recorded as an error just to fill a quota.

For compatibility, legacy four-field errors can still be grounded when their
quote occurs exactly once. Ambiguous repeated text requires explicit offsets.
Missing legacy severity/confidence use `form`/`high` compatibility defaults;
these defaults are not calibrated model probabilities. New prompts explicitly
request both fields.

Invalid evidence or response schema allows one repair with the same learner
turn, within a 12-second training diagnosis deadline. Unavailable or invalid
diagnosis leaves feedback unassessed while the conversation proceeds if the
remaining skills succeed. A cancelled or failed overall turn still uses the
existing draft and retry behavior. In Free Conversation, diagnosis is an
optional part of the usual model reply. The plain-text fallback can still supply
a partner reply.

## Teaching and learner feedback

The existing deterministic intervention chooses one priority correction and
obeys `correctionMode` and `maxCorrections`. Diagnosis and correction delivery are
distinct: detected issues can be retained without being delivered during the
conversation. Only a correction matching an accepted diagnosis can reach the
partner's correction directive.

Intervention also spaces corrections, suppresses exact recent reminders and
verifies a brief recast before counting delivery. Course intervals and behavior
are documented in [Teaching Intervention](TEACHING_INTERVENTION.md).

Both views derive the message verdict from the saved diagnosis. A completed
assessment with an accurate expression shows a green check. A validated error
or useful expression improvement shows an amber exclamation mark. Uncertain
or missing assessments carry no mark. Correct short replies such as `Yeah.` are
valid in context, and limited demo assessments display only recognized errors.

The learner can open the mark to see the original, recommended wording and a
brief explanation. Errors highlight the original span in red. Improvements use
a neutral original panel. The suggestion can be read through existing speech
settings. Opening and closing only reads the saved result.

Training's correction switch also hides the verdict marks when set to Off.
With feedback enabled, a grounded issue can be opened under its original
message even when its proactive correction is deferred. Timing and budget apply
to recasts in the partner's reply. Expression improvements contribute only to
the message's on-demand feedback.

For example, `We often to play tennis.` can receive `We often play tennis.`
as a suggestion. Choosing between `can` and `cannot` when speech recognition
is uncertain is a separate pre-send confirmation. Post-send feedback evaluates
the wording the learner actually submitted. Older checkpoints still open
with their saved transcripts. The message feedback hides older suggestions
that would fail the polarity check.

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
original-span information. The existing atomic checkpoints save language feedback
with the message and its source. Failed writes preserve the input for retry and
avoid double counting. The optional improvement and timestamp extend checkpoint
version 1 without a SQL migration or new IPC command.

Confirmed errors feed error memory and targeted correction exercises. Expression
improvements stay with the original message. Lesson review receives validated
assessments with uncertainty, demo source and delivery information. Its model context includes at most ten recent
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
