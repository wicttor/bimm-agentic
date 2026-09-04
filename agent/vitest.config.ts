import { defineConfig } from "vitest/config";

// The agent sub-project runs in a plain **node** environment and only collects
// tests under `agent/`, so it is never swept into the app's jsdom project.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["agent/tests/**/*.test.ts"],
  },
});
