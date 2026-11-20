# Travel teaching evaluation

The initial rubric in [travel-stage-cases.json](../../content/evaluation/travel-stage-cases.json)
uses eight manually specified cases across Hotel Check-in, Airport Check-in
and Restaurant Order. Each case gives the course, stage, learner utterance,
per-criterion judgments, acceptable brief corrections and a rationale. It
includes partial and factually wrong replies, a valid paraphrase, a legitimate
grammar correction and grammatical replies that should not be corrected.

## Run and record

Run `pnpm eval:travel` for a repeatable, scripted replay through the connected
Training code path with mocked transport. Independent mock responses seed one
false pass, one false miss, and one inappropriate live correction. Its timings
measure local replay. They should be interpreted separately from manual
connected-model recordings and next-day learner outcomes.

For a provider check, run each sample as the first learner turn of a fresh
matching AI lesson. Use fictional values, a dedicated test profile, and the
same provider and model for all cases in a run. Record the disconnected
scoring input in a separate local JSON file using this format:

```json
{
  "cases": [
    {
      "id": "hotel-complete",
      "criteria": [true, true],
      "stageAdvanced": true,
      "correction": null,
      "validReplyMs": 1430
    }
  ],
  "nextDay": null
}
```

Include each of the eight case IDs once. Record the displayed criterion checks
in order and whether the lesson advanced from the sampled stage. Use `null`
when there is no assessment or independently visible
valid reply. Capture only the correction shown in the dialogue, with
`original` and `corrected` when present. Measure from Send to the first
usable, saved reply, excluding audio capture, speech playback and timeouts.
Use `null` for aggregate next-day results until there is a closed cohort.
For a closed cohort, record `{ "eligible": N, "completedOnTime": M }`.

Score with `SAYDEN_TRAVEL_OBSERVATIONS=/path/to/local-observations.json pnpm eval:travel`.
The output records false passes and false misses for stage transitions and
for individual criteria, delivered
light-correction false positives, unassessed/valid reply counts, latency P50
and P95, and the next-day numerator and denominator when supplied. The
command does not contact a model. Use the kept observation file to compare
providers or prompt changes. Avoid saving any learner conversations into
benchmark fixtures.

## Next-day practice pilot

In Review, a completed AI Hotel Check-in lesson unlocks a different authored
hotel situation on the next local calendar day. The source can have at most
one active linked attempt. Leaving the attempt allows it to be reopened.
All verified goals mark completion even if the learner opens the report later.
A late attempt is still available for practice.

The denominator counts eligible sources whose next-day window has elapsed,
including lessons with no attempt. The numerator counts linked attempts whose
goals were verified before that window closed. A different supplied booking or
room constraint tests transfer within the hotel domain. It is not an estimate
of broad English fluency. The optional `travelTransfer` field extends
version-1 Training checkpoints with a source ID and verified completion time.
Older checkpoints remain readable. No database migration is needed.

## Choosing the next investment

Start with a small connected-model and learner pilot before comparing roadmap
options. Keep the benchmark criteria and model configuration fixed per run.

- Stage false passes or unhelpful corrections point to teaching checks that
  need refinement before expanding AI-generated courses.
- Repeated errors in understanding the partner's facts or questions support
  investment in listening tasks. Label these during observation so they can be
  distinguished from a valid paraphrase being misgraded.
- Strong initial performance with weaker next-day transfer supports work on
  review timing, retrieval and scenario variation. Separate learners who
  opened the attempt from those who never started.
- When assessment and transfer are stable and learners need scenarios outside
  the existing library, compare AI course generation on coverage and the same
  teaching rubric. Watch response P95 and invalid reply counts before adding
  more model calls to the conversation path.
