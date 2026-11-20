# Contextual speaking practice

## Give me a line

The Free Conversation and Training composers expose **Give me a line** next to
the keyboard and microphone. The request is explicit and does not alter the reply
draft or add text to the conversation. The learner can read, listen, dismiss the
example, or send an answer in their own words. Examples are reused for the same
partner message. New turns and navigation cancel obsolete requests.

Connected requests use the existing Model Gateway. The request sends the learning
language, a bounded recent exchange and up to 800 characters of the learner's
draft. Unconfirmed Free Conversation transcript ambiguities exclude the draft
from the request. Training also sends the role, scenario and current stage. The
example and its communicative intent are validated before display. Guided Training
uses the current course's example or compatible authored material. Hotel Check-in
includes booking and luggage-storage practice; typing a storage request at the
services stage selects the latter.

The next eligible learner reply is assessed against the example's intent. A
connected assessment must cite an exact excerpt of the learner's actual reply.
Unknown or invalid judgments become uncertain, so they cannot block an ordinary
conversation reply. Course objectives, vocabulary tracking and light correction
continue to use their existing transcript evidence. A viewed example is separate
from saying it. The first example in a new free chat is kept in memory until the
chat has a saved exchange.

## Try it in a new situation

After a successful assisted expression, Free Conversation offers this action on
the applicable message. A finished Training lesson and its saved report offer one
expression, prioritizing the current lesson. When cross-session memory is
enabled, they can also offer a ready expression from a completed lesson with the
same broad course category and learning language.

Opening the action creates or reopens a short saved practice. The example stays
hidden until explicitly revealed. The learner types or records a reply and can
skip the task. The assessment distinguishes independent success, assisted
success, clear mismatch and uncertainty. Connected assessment accepts
paraphrases with the same communicative outcome. Offline Hotel exercises accept
authored equivalents and leave unsupported wording unconfirmed. These are
observations from individual attempts and do not establish mastery.

The configured model provider generates a new situation when an authored task
is unavailable. It receives the expression's goal, example, learning language and original partner prompt.
Assessment sends the task criterion and the submitted reply. Responses use
separate schemas and time limits. Audio uses the existing device/provider speech
loop. No separate account or new external service is needed.

## Persistence

An optional `speakingPractice` version 1 object extends both version 1 checkpoint
formats. Legacy checkpoints without the object are valid. It records the partner
message, stage when applicable, shown example, exact learner-message reference
and subsequent transfer task and attempts. Each attempt has its own ID, reply,
assessment, evidence and assistance status. The latest ten attempts per task are
retained. The corresponding learning-memory event holds a compact versioned
index of ready and finished expressions.

The checkpoint and projection use the existing single SQLite upsert. A historical
attempt updates its original lesson as the source of truth. Deleting a source
removes its checkpoint and recommendation; cross-session selection reads the
existing memory preference. Review exercises and transfer attempts use separate
records. There is no SQL migration or new IPC route.

## Verification

Browser tests use mocked Tauri IPC and an injected model endpoint. They cover
draft preservation, repeated clicks, keeping the normal conversation reply,
restoring independent results, offline Hotel Check-in paraphrases, assistance
tracking and cross-session memory controls. Unit tests exercise schema validation,
forged evidence, offline uncertainty and source selection. Physical speech
verification is covered by the platform matrix in [Voice loop](VOICE_LOOP.md).
