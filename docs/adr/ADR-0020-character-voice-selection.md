# ADR-0020: Select playback voices by character

- Status: Accepted
- Date: 2026-11-19

## Decision

- Treat the voice as a playback preference. Follow Character uses the course
  character's optional `voiceStyle`, then a small set of known character
  names. The default partner, Zoi, and Maya use a female voice. Unrecognized
  names use the playback backend's default for the course.
- A learner can request female, male or default playback for every course.
  For device playback, rank only installed local voices for the course
  language. Use recognized voice identifiers to match the preference and use
  the same-language fallback if the preferred voice is unavailable. The
  Web Speech API exposes voice names and identifiers and has no gender field.
- With provider playback, the learner can configure the provider's female
  and male voice IDs. Use Nova and Onyx as built-in role choices for known
  OpenAI speech models at the official endpoint. Other configurations use
  their previously entered voice ID when no role voice is configured.

## Compatibility

Version 1 speech settings and course templates gain optional fields. Existing
device settings follow the character automatically. Existing provider settings
retain their saved voice until the learner selects another voice mode. The
voice choice applies to on-demand and automatic reply playback and to listening
previews. It does not change dialogue context, speech recognition, credentials
or checkpoint writes. No new native command or database migration is required.
