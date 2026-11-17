# ASR / TTS: the voice loop

## Setup and use

In **Settings → Speech input and playback**, enable recognition and configure an
OpenAI-compatible ASR endpoint/model (for example `whisper-1`). Use HTTPS or a
localhost HTTP server. Enter a separate ASR key for an authenticated endpoint;
localhost services may be keyless. Keys are stored only in the OS keyring, scoped
to the exact normalized endpoint and ASR/TTS capability. Blank key fields retain
existing keys. Nonsecret preferences survive restart in SQLite.

Keyring writes and SQLite preferences cannot share one transaction. If preference
saving fails, the previous preferences stay active, while a submitted key may
already be updated in its endpoint-scoped keyring entry. Retry the save; no key is
copied into the preference payload.

Choose **Device voice** for an installed local voice matching the course language,
or configure a provider's `/audio/speech` endpoint, model and voice. Provider TTS
uses MP3 (`response_format: mp3`) and the selected speed. A reachable model-list
endpoint does not prove that its audio models are supported. Existing LLM setup
does not automatically enable or authorize a speech service.

During Training:

1. Choose **Record reply**, then grant microphone permission. No recording starts
   on page load. Playback stops before capture, and video is never requested.
2. Choose **Stop and recognize**. Recording also stops after 45 seconds or at the
   5 MB bound. Audio is sent to the configured ASR service and kept only in memory.
3. Review/edit **Recognized speech**, then choose **Use transcript** or **Append
   transcript to draft**. An existing draft is preserved. If the combined text
   exceeds 4,000 characters, shorten it explicitly; words are never silently cut.
4. Choose **Send reply**. Only the confirmed composer text enters teaching. A
   failed checkpoint save keeps the draft/provenance for retry without another
   recognition request or duplicated learning progress.
5. Use **Read latest partner reply**, an individual **Read message** button, or
   enable automatic reading in Settings. Automatic reading happens only for new
   successfully saved replies, including help responses, never restored history.
   **Stop playback** cancels loading or speaking. A playback failure can be retried
   independently without resending or changing lesson progress.

Recognition failure permits **Retry recognition** from the same in-memory
recording, recording again, cancellation or typing. Leaving the lesson, changing
the lesson/settings or cancelling stops tracks and invalidates pending results.
Successful recognition discards the recording; unconfirmed preview text is not
saved. Cancelling a pending permission request closes its stream if it arrives
later. Replay releases the previous audio and URL first.

## Evidence and privacy

The existing checkpoint optionally records speech provider ID, course language,
whether the confirmed text was edited, and confidence only when supplied. It
does not save audio, blob URLs, keys or the raw recognition draft. Original text
checkpoints remain valid. Teaching sees confirmed words and keeps the established
support-request exclusions, exact citations, deterministic vocabulary and error
diagnosis contracts. Speech metadata cannot establish oral fluency, pronunciation
or mastery; confidence describes recognition only.

Recognition is disabled by default. Reading is manual by default, and device
speech uses only voices marked local for the course language. Provider ASR sends
recordings to the enabled endpoint; provider TTS sends partner reply text. These
destinations are explained in Settings and the recording controls. Speech keys
are separate from LLM keys and never enter local/session storage or event payloads.

`model-gateway/providers/openai-audio.ts` implements bounded multipart ASR and JSON
TTS. Redirects are rejected, network/auth/rate/timeout failures are classified, and
errors omit provider bodies. Deadlines cover response streaming, not just headers.
`speech/capture.ts` and `speech/playback.ts` own cancellation and resource cleanup;
`useSpeechLoop.ts` recreates them safely across React StrictMode/lesson changes.
The existing IPC/keyring path is used; no new native command or migration exists.

## Platform requirements and verification

- Chromium/WebView2 normally captures WebM/Opus; WKWebView can choose MP4 when
  supported. Never hard-code WebM for macOS. Unsupported capture keeps text input
  available. Recognition uses MediaRecorder, not browser SpeechRecognition.
- macOS bundles merge `Info.plist`'s `NSMicrophoneUsageDescription` and use
  `Entitlements.plist`'s `com.apple.security.device.audio-input`. OS permission
  must still be granted. No camera permission is requested.
- The current permitted direct-fetch transport requires CORS support for the
  actual webview origin, including POST preflight and authorization. A Rust proxy
  remains future work under ADR-0002. Local-server ASR/TTS support is configured
  separately from the conversation model.
- Missing device voices, denied microphone access, decoding failures and autoplay
  restrictions produce visible errors. Retry the read button after a user gesture
  or choose a provider/device configuration; text progress is preserved.

Automated checks use no real keys or provider models. Unit tests cover request
shapes, container selection, limits, confidence validation, body deadlines,
cancellation/late results, local voice selection, URL cleanup, credential scoping,
speech metadata and SQLite preference rollback. Browser e2e uses Chromium's fake
microphone through real MediaRecorder and real HTML audio decoding of a committed
synthetic silent MP3 fixture, with mocked HTTP provider responses. The fixture was
generated once with FFmpeg; FFmpeg is not a runtime or CI dependency.

Before a native release, test on **macOS WKWebView** and **Windows WebView2**:

- First microphone grant, denial, OS revocation and subsequent retry.
- Negotiated recording type, actual ASR language/result and manual corrections.
- Cancel while permission/ASR is pending, navigation, lesson change and 45-second
  stop; verify the OS microphone indicator switches off.
- Installed local language voice, provider MP3 decoding, stop/replay, optional
  autoplay after save and recovery from playback blocking.
- Save/restart, real keyring lookup, provider authentication/CORS errors, offline
  failure, preserved typed drafts and one saved turn on checkpoint retry.

The current Linux workspace has no Cargo/Rust or WebKitGTK. `tauri info` confirms
those missing prerequisites, and `tauri dev --no-watch` stops at `cargo metadata`.
Native packaging and physical-device behavior have not been verified here;
browser automation is not a substitute for this matrix.

Run `pnpm typecheck && pnpm lint && pnpm test`, `pnpm test:e2e` and
`pnpm --filter @language-lab/desktop build`. Native builds require the platform's
Tauri prerequisites and the above device checks.
