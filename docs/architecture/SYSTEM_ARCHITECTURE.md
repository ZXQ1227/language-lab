# System Architecture

Status: placeholder.

Authoritative decisions so far (blueprint v1.1):

1. Two processes: webview (no Node.js) and Rust core (system permissions).
2. SQLite runs in the Rust core; webview reaches it over IPC.
3. API keys live in the OS keyring; AI provider calls are proxied by Rust.
4. `content/` is read-only product data; SQLite is user data.

Sections to fill in: process diagram, IPC command surface, data flow per
conversation turn, update and backup flow.

## Scenario courses

Versioned scenario content now includes optional authored course templates with
roles, target expressions, ordered stages, success criteria and feedback budgets.
All shipped scenarios include this material; legacy metadata-only content remains
readable. Zod validates content and cross-references at the boundary; a published
JSON Schema supports authoring tools.

The scenario SQLite table continues to store its existing metadata projection.
Course content reaches the orchestrator through `ScenarioView.courseTemplate`;
`initLesson` compiles a configured copy into a validated `LessonState` snapshot.
Dialogue and deterministic interventions use this snapshot, so subsequent content
syncs cannot alter an in-progress course. No database schema changes are required.

The Scenarios page provides course previews, level/feedback configuration and
validated JSON import/export. Edits and imported previews are temporary until
exported to a file. Objective-evidence evaluation and the Training conversation UI
remain separate work. See [Scenario courses](../development/SCENARIO_COURSES.md).
