import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@language-lab/model-gateway": path.resolve(__dirname, "packages/model-gateway/src/index.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
