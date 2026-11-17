import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests import workspace packages by name; vitest does not read the
// root tsconfig paths, so every package is aliased to its TS entrypoint.
const workspaceAliases: Record<string, string> = {
  "@language-lab/core": "packages/core/src/index.ts",
  "@language-lab/shared": "packages/shared/src/index.ts",
  "@language-lab/database": "packages/database/src/index.ts",
  "@language-lab/skills": "packages/skills/src/index.ts",
  "@language-lab/memory": "packages/memory/src/index.ts",
  "@language-lab/model-gateway": "packages/model-gateway/src/index.ts",
};

export default defineConfig({
  resolve: {
    alias: Object.fromEntries(
      Object.entries(workspaceAliases).map(([name, file]) => [name, path.resolve(__dirname, file)]),
    ),
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
