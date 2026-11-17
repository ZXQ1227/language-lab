// Drizzle Kit config: schema lives here, generated SQL migrations are written
// directly into the Rust core, which embeds and executes them at startup.
// One source of truth, no copy step.

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "../../apps/desktop/src-tauri/migrations",
});
