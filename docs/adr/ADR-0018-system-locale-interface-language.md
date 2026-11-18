# ADR-0018: System locale and independent interface language

Date: 2026-11-18. Status: accepted for this feature branch.

## Decision

The app starts in the OS preferred display language without a language wizard.
Rust returns `systemLocale` and the independent regional `regionLocale` over the
`get_system_locale` command. The frontend validates that response before use.
Supported app tags are `zh-CN`, `zh-TW`, `en-US`; English is the unsupported-language
fallback. Chinese Hans/Hant scripts take precedence over region; TW/HK/MO map to
traditional Chinese when no script is present. Other Chinese regions use simplified
Chinese. English regions share the English resource set.

Explicit persisted manual selection takes precedence over OS language. Follow
system re-reads the OS when restored, on focus/language/visibility events and every
30 seconds while visible. Manual mode updates OS metadata without changing the
chosen interface language. Bootstrap reads OS and preference concurrently before
rendering pages; a five-second read deadline prevents an unavailable IPC bridge
from blocking the shell forever. On native-read failure, the available webview
language/region is used temporarily, then English if unavailable; the UI offers
retry. Read failures never save fallback preferences.

`i18next` and `react-i18next` provide bundled resources and reactive text updates;
they are the user-requested standard framework and avoid custom translation,
interpolation and React subscription machinery. They add frontend JavaScript,
with no Node/native runtime requirement. The selected i18next 25 / react-i18next 16
lines preserve the repository's Node 20 development baseline; newer major releases
require Node 22. Namespaces cover common, dashboard, settings, scenarios, training,
course, memory, reports, review and speech. All three
languages are bundled so switching needs no network. Static JSX/a11y-copy tests,
resource-key and interpolation parity tests guard the boundary. Known application
errors are translated at render time; unknown provider/IPC diagnostics retain their
verbatim technical details below a localized message.

`sys-locale` 0.3.2 is the small cross-platform Rust dependency for actual preferred
UI language (Apple preferred languages / Windows preferred UI languages). Browser
`navigator.language` alone cannot reliably represent desktop OS preference. OS
region is read separately using CoreFoundation on macOS, Win32 on Windows and
locale environment variables on Linux. The native calls use bounded buffers and
retain/release ownership. No shell subprocess or entire OS plugin is required.

The locale store owns a version-1 preference: `{version:1, localeMode:"system"}` or
`{version:1, localeMode:"manual", appLocale:"zh-CN"|"zh-TW"|"en-US"}`. It is saved
through existing validated IPC/repository access in a learner-scoped `locale_settings`
event in `learning_events`. No SQL DDL changes or migration are required. Earlier
apps have no such event and default to system mode. Invalid/future JSON versions
are preserved and block preference writes until a successful reload. No manual
learning-database editing, localStorage credentials or learning-record rewrites.
Only successful persistence publishes a new choice. Request-generation checks
prevent older OS responses from overwriting a newly saved manual choice.

UI dates/times/numbers use Intl with the current UI language plus OS region.
`document.lang`, direction and title follow the interface. Locale changes rerender
copy without remounting the page or changing training/speech dependencies. UI
locale never enters teaching prompts, profile learning language, ASR/TTS language,
course snapshots or persisted replies. Authored course/exercise content, learner
quotes and model explanations remain learning content in their existing language.
This task does not add translated course packs or change teaching language policy.

## Verification boundary

Unit tests cover resolution, resource/placeholder parity, static UI-copy guards,
regional formats, persistence/failure/timeout behavior and stale-response races.
Playwright mocks IPC for startup languages, switching/restart/focus, write failure
and preserving an active draft/checkpoint. SQLite tests exercise a real isolated
database. `tests/native-locale` imports the exact production Rust module without
Tauri/GTK and runs the adapter tests. CI runs that harness on Linux, macOS and
Windows; full desktop and real OS-language switching still require native device
validation. Browser tests do not establish native webview/microphone behavior.
