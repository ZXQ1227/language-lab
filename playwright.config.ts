import { defineConfig, devices } from "@playwright/test";

// E2E tests run against the plain Vite dev server (port 1420, the port Tauri
// expects). The Tauri IPC bridge is mocked per-test via addInitScript, so no
// Rust binary or API key is needed in CI.

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [
        ["html", { open: "never" }],
        ["junit", { outputFile: "test-results/e2e-junit.xml" }],
      ]
    : [["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:1420",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Run vite directly (not via pnpm) so the server starts regardless of
    // how pnpm is exposed on the invoking PATH.
    command: "node apps/desktop/node_modules/vite/bin/vite.js apps/desktop",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
