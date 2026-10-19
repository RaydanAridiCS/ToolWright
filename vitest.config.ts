import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "core",
          environment: "node",
          include: ["packages/core/tests/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "db",
          environment: "node",
          include: ["packages/db/tests/**/*.test.ts"],
          testTimeout: 30_000,
        },
      },
      {
        esbuild: { jsx: "automatic" },
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["packages/ui/tests/**/*.test.tsx", "packages/tools/tests/**/*.test.{ts,tsx}", "apps/web/tests/**/*.test.{ts,tsx}"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.{ts,tsx}"],
      exclude: ["**/*.generated.ts", "**/index.ts"],
      reporter: ["text-summary", "html"],
    },
  },
});
