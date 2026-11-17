# ADR-0017: Confirmed speech input and cancellable reply playback

- Status: Accepted
- Date: 2026-11-18
- Deciders: project lead + AI engineering agent

## Context

Model Gateway exposed ASR/TTS interfaces with mocks only. Training accepted text
and had no microphone, transcription confirmation or playback. Browser speech
recognition is not a dependable WKWebView baseline, and treating a transcript as
an oral-fluency or pronunciation assessment would misrepresent the evidence.

## Decision

- Add real OpenAI-compatible ASR/TTS adapters behind the existing interfaces.
  ASR uploads a negotiated recording container with model and course-language
  hint; TTS requests bounded MP3 output with voice/rate controls. Validate results,
  bound recordings/responses and keep deadlines active through response-body
  reading. Requests support cancellation, reject redirects and never expose
  provider bodies or credentials in errors.
- Continue the browser-fetch fallback permitted by ADR-0002 until a Rust model
  proxy exists. Endpoints require HTTPS, with HTTP permitted only for loopback.
  Providers must permit the webview origin through CORS. No cloud backend,
  provider-specific executable or runtime dependency is introduced.
- Save nonsecret speech configuration in a learner-scoped setting row in the
  existing events table. Keep ASR and TTS keys in separate endpoint-scoped OS
  keyring entries. Recognition is off and automatic reply playback is off by
  default. Explain the audio/text destinations before the learner enables them.
- Capture only after Record reply, requesting audio without video. Negotiate
  WebM/Opus, MP4 or Ogg according to MediaRecorder support; stop at 45 seconds or
  5 MB. Stop all tracks on completion, cancel, error, lesson change and unmount,
  including permission requests that resolve late. Retain a failed recording only
  in memory for an explicit ASR retry; discard it after success/cancel.
- Show an editable recognition preview before it enters the composer. Append to
  an existing draft only on explicit action, enforcing the combined length limit
  without truncation. Sending remains a separate learner action.
- Route confirmed words through the existing teaching/checkpoint pipeline with
  optional speech provenance (provider, course language, edit flag and supplied
  recognition confidence). Persist no recording, audio URL, raw recognition
  draft or key. Confidence is not language ability; only confirmed text supports
  objectives, vocabulary and diagnosis. Old text checkpoints remain readable.
- Offer installed local device voices or configured provider TTS, manual reading
  per reply, stop/replay and opt-in reading of new replies only after successful
  checkpoint saves. Do not read restored history automatically. Recording stops
  playback; active capture prevents reading or submitting competing turns.
  Cancel stale synthesis and release audio/utterances/object URLs on replacement,
  stop or navigation. Playback failure never resends a learner turn.
- Add macOS microphone usage text and the hardened-runtime audio-input
  entitlement. Keep native permission prompts and text fallback. No camera
  permission or new Rust/IPC command is needed.

## Consequences

The learner can record, review, send, receive a reply and hear it, while text
practice remains available on unsupported/denied devices. Audio and text leave
the device only through the explicitly selected speech providers. Device voices
must be local and match the course language; unavailable voices produce an
actionable error instead of silently choosing remote speech or the wrong language.

Tests cover HTTP contracts, bounds, cancellation, stale results, real SQLite
preferences, confirmed-text evidence and browser MediaRecorder/playback using
synthetic input and mocked provider responses. Those tests do not establish
recognition quality or native microphone behavior. WKWebView/macOS and WebView2/
Windows physical-device checks remain a release validation requirement; this
Linux environment lacks Rust/Cargo and WebKitGTK for a native smoke run.
