import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    // Pin the app project to generated-app/ so agent/** tests are never collected here
    // (they run under agent/vitest.config.ts in a node environment).
    include: [
      "generated-app/**/*.test.{ts,tsx}",
      "generated-app/**/*.spec.{ts,tsx}",
    ],
    setupFiles: ["./generated-app/test-setup.ts"],
  },
});
