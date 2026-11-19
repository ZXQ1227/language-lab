# AI Installation Protocol (LLAIP)

Status: placeholder.

The Language Lab Agent Installation Protocol (LLAIP) defines how an AI assistant
installs Sayden (formerly Language Lab) for an end user. Planned stages:
Discover → Inspect → Verify → Install → Configure → Validate.

Desktop bundles and the app window use the name Sayden. The sidebar and
startup screen pair the app logo with the same name.
The app keeps the existing bundle identifier, database filename, keyring service
and WiX upgrade code so existing installations retain their data and credentials.

Hard rules (already decided):

- End users install prebuilt signed installers from GitHub Releases only.
- The assistant must not execute unreviewed scripts from this repository.
- Provider API keys are entered by the user in the app settings page and go
  straight into the OS keyring; the assistant never receives them.
- The health check includes: SQLite opens, migrations applied, backup
  directory writable.
