# System Architecture

Status: placeholder.

Authoritative decisions so far (blueprint v1.1):

1. Two processes: webview (no Node.js) and Rust core (system permissions).
2. SQLite runs in the Rust core; webview reaches it over IPC.
3. API keys live in the OS keyring; AI provider calls are proxied by Rust.
4. `content/` is read-only product data; SQLite is user data.

Sections to fill in: process diagram, IPC command surface, data flow per
conversation turn, update and backup flow.
