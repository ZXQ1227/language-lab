# Dynamic Dialogue Roleplay

`skills.dialogue_roleplay` v0.2.0 speaks for the scenario character. The
orchestrator remains responsible for intervention choice, objective evaluation,
budgets and persistence. Roleplay cannot mark an objective complete.

## Character and conversation

The optional `courseTemplate.character` supplies `name`, up to five `traits`,
`speakingStyle`, `motivation` and `boundaries`. Hotel Check-in introduces Maya, a
welcoming, precise and patient receptionist. The profile is part of the immutable
course snapshot. Existing courses without it continue using `roles.partner`.

The skill receives the latest learner message, recent user/partner dialogue,
verified learner memory, current criteria/progress, authored facts and the
previous stage when a stage just completed. Its instructions prioritise:

- Answer the learner's latest meaning and direct questions before a follow-up.
- Use the configured CEFR level, keep replies concise, and ask at most one
  follow-up question rather than reading the whole rubric aloud.
- Preserve the character and known facts; clarify ambiguity and redirect a
  digression without inventing a booking, price or learner answer.
- Answer pending questions from the completed stage before bridging to the next.
- Use verified partial progress to elicit a missing criterion instead of
  repeatedly asking for already demonstrated information.

At most 20 recent messages and 8,000 characters of message text reach reply
generation. System-role history is excluded instead of being promoted to new
instructions. History labels identify learner message numbers and support
requests; those labels are not part of learner quotations. Longer-term learner
details are supplied separately as untrusted quotes.

## Grounded dialogue memory

The model may return optional `memoryUpdates`: up to six `{ id, messageSeq,
quote }` records. A stable id such as `room-preference` identifies a learner
detail. Core validation requires an exact quote from a learner **practice**
message. Assistant replies, help controls, invented names and older replacements
for newer statements are rejected. Short messages (up to 300 characters) must be
quoted in full, preserving negation and qualifications. Longer messages may use
a self-contained quote of at most 300 characters.

`LessonState.dialogueMemory` keeps the latest 12 distinct details, while
`lastDialogueMove` records the previous response move. Checkpoint restore
revalidates memory against the saved transcript. Statements are not hotel facts:
"I would like room 999" cannot change the authored room assignment. A later
explicit learner preference can replace an earlier quote with the same id.

These are additive optional fields. Existing version-1 states and checkpoints
remain readable; no database migration or new IPC command is necessary.

## Repeat, simpler English and hints

Training provides **Repeat last reply**, **Use simpler English** (connected AI),
and **Give me a hint**. An unsent draft remains in the composer while using them.

- Repeat returns the last saved partner reply exactly, with no model or keyring
  request. This also works when a connected provider is temporarily unavailable.
- Simpler English rephrases the previous reply using shorter everyday language
  while preserving facts. It does not lower the course's configured level or
  advance objectives.
- A hint scaffolds one unmet criterion and consumes one per-lesson hint. Once
  the budget is exhausted, the button disables and the runtime rejects further
  hints before generation. A model cannot issue a `hint` move without an approved
  teaching directive.

The runtime recognises a small set of standalone English controls such as
"Please repeat your last reply", "Could you say that in simpler English?" and
"Could you give me one hint?" Other utterances take the normal practice path.
Scene-specific questions such as "Could you repeat the Wi-Fi password, please?"
remain practice, as do sentences that negate a request.

Both sides of support exchanges are saved with `purpose: "support"`. They skip diagnosis,
vocabulary tracking and objective evaluation, never count as objective citations
or learner memory, and are excluded from the review transcript. Explicit hints
still increment `hintsGiven`, which is included separately in the review context.
All exchanges, including support, count toward the
existing 100-exchange session limit and keep the transcript sequence consistent.
Guided mode supports authored hints and exact repeat; it does not simulate free
dialogue or simpler-English generation.

## Reply validation and recovery

The original `{ reply, tone }` response remains accepted. Optional `move` is one
of `respond`, `follow_up`, `clarify`, `redirect`, `close`, `repeat`, `simplify` or
`hint`. A supplied move must match an explicit support request. Replies are
trimmed, nonempty and at most 1,600 characters.

An accidental duplicate of the latest partner reply is regenerated once using
the same learner turn and a repair instruction. Explicit repeat is exempt. If
the second candidate also repeats, the operation fails; it never loops or saves
another turn. Generation uses a bounded output budget. Invalid replies, memory,
or failed SQLite writes preserve the previous checkpoint and the learner's draft.

## Verification and limits

Unit tests exercise profile/fact/stage context, bounded history, role handling,
quoted memory including negation and later updates, repair bounds, support
budgets, legacy responses and restore. Playwright exercises live transport with
intercepted responses: preference persistence, simplified/identical repeat,
duplicate recovery, failed-write retry and help without awarded learning goals.

Tests establish data flow, contracts and deterministic guards. Naturalness,
semantic role consistency, factual accuracy and teaching quality still depend on
the selected model and require live-model evaluation. The profile and prompt are
not a guarantee that an arbitrary model will follow every conversational rule.
