import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/support/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/integration/support/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/generated/**"],
      reporter: ["text-summary", "html"],
      reportsDirectory: "coverage/integration",
    },
    env: {
      NODE_ENV: "test",
      ...(testDatabaseUrl
        ? {
            DATABASE_URL: testDatabaseUrl,
            DIRECT_DATABASE_URL: testDatabaseUrl,
          }
        : {}),
    },
  },
});
