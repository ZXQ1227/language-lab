# Hotel Check-in: the first complete learning pack

## Learner route

Choose **Hotel Check-in** in Training, or open its Scenarios card and select
**Configure course → Practise this course**. The A2 course takes about 20 minutes:
preparation, five guest tasks and independent recall afterwards.

1. Read **Practice guest card**. All hotel and guest details are fictional.
2. Try three warm-up tasks before opening their sample answers.
3. Study 12 vocabulary items (English meanings, Chinese glosses and examples),
   eight expression patterns and the standard model conversation.
4. Choose standard check-in or one of the two challenges.
5. Practise with guided examples or a connected OpenAI-compatible model.
6. Complete the five stage rubrics and select **Finish and review**.
7. Write independent review answers from memory, compare with examples and
   **Save review answers**. Reopening the saved session restores them.

Guided mode checks authored example replies and does not measure independent
proficiency. Connected mode uses grounded objective evaluation; semantic judgments
depend on the selected model. Independent review answers are self-checked, not
automatically graded. Save review edits before leaving the page.

## Course facts and rubric

Alex Chen has a two-night reservation at fictional Harbor View Hotel, reference
HV-2048, in a non-smoking double room. A $50 refundable deposit is separate from
the room charge. Breakfast is included from 7 to 10 a.m. Wi-Fi is HarborGuest
with fictional password welcome24. Check-out is at 11 a.m.; room 412 is on the
fourth floor, elevator to the left.

The same facts reach dialogue and evaluation. They are authored practice data,
not real hotel policies, prices or credentials. ID tasks require spoken roleplay
responses, never actual documents, identity numbers or payment information.

| Stage                         | Learner demonstrates                                                                  | Insufficient evidence                                              |
| ----------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Find your reservation         | Gives Alex Chen's reservation and a two-night stay.                                   | "I need a room" without booking details.                           |
| Confirm your stay and room    | Confirms the double room/two nights and politely requests a quiet room.               | Only "yes", or a room type without a preference.                   |
| Clarify the deposit           | Responds to ID, asks about the deposit and understands separate/refundable.           | "I will pay fifty" without checking what the deposit means.        |
| Ask about hotel services      | Asks about breakfast inclusion/time, Wi-Fi and check-out.                             | Asking only about breakfast.                                       |
| Confirm the details and close | Confirms room 412, 11 a.m. check-out, fourth floor/left elevator and closes politely. | Incorrect room/time details, or thanking without checking details. |

Criteria can be demonstrated across several replies. Exact learner citations are
required; the partner's examples are not learner evidence. Pending service
questions are answered before the partner asks for final confirmation, including
when evaluation advances the stage in that same turn. This rubric is authored
acceptance guidance, not a measured real-model accuracy benchmark.

## Challenges

**Reservation not found** changes the opening, first-stage instruction, rubric and
guided reply. The guest supplies HV-2048 and Alex Chen and politely asks for
another lookup. The receptionist then finds the existing reservation. A standard
name-only example does not pass this challenge's guided check.

**Quiet room unavailable** changes room-availability facts and the second-stage
rubric. Room 412 is available tonight; a quiet room can be arranged tomorrow after
10 a.m. The guest acknowledges the limitation, accepts tonight's room and politely
discusses moving tomorrow. Subsequent prompts do not promise a quiet room tonight.

The model conversation is explicitly labelled standard. Challenge briefings and
guided examples supply the changed situation. Export/import and saved-session
restore preserve the selected challenge.

## Source and runtime

`content/scenarios/hotel-checkin.json` is explicitly bundled by
`apps/desktop/src/content/scenarioContent.ts`. Its optional `learningPack` contains
overview, prerequisites, facts, vocabulary, warm-up, model dialogue, per-stage
guided practice, review and variations. Old simple courses remain compatible.

Zod checks stage references, guided/model coverage, vocabulary coverage, unique
ids, fact overrides and the selected challenge. The published JSON Schema covers
structural constraints; Zod also checks cross-references.

`configureScenarioContent` records `selectedVariationId` on the authored source.
`resolveCourseTemplate` compiles changed instructions, criteria, facts, opening and
guided prompts into a copy. Original standard stages stay intact, so selecting
standard again or exporting a chosen challenge is lossless. The resolved copy is
snapshotted and rechecked on restore. Only original bundled material qualifies for
guided mode; edited teaching material or examples require connected AI.
Eligibility is checked when starting a new demo. An existing pack session uses
its saved authored guides even if the bundled course is updated later.

Completed sessions save `reviewAnswers`, keyed by valid review-exercise ids, in the
existing atomic SQLite checkpoint. Unknown ids and answers attached before course
completion fail validation. A failed write preserves both saved progress and the
form's answers for retry. No database migration or Rust command was added.

See [Scenario courses](SCENARIO_COURSES.md) and [Teaching loop](TEACHING_LOOP.md).
Tests cover all three routes, evidence/state restore, review failure/retry and
selected-challenge export/import. Real model quality and native macOS behavior
still require on-device validation with a configured provider.
