import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const e2eDatabaseUrl = process.env.E2E_DATABASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- --hostname 127.0.0.1 --port ${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    url: `http://127.0.0.1:${port}`,
    env: {
      APP_URL: `http://127.0.0.1:${port}`,
      MEDIA_STORAGE_ROOT: "/tmp/rivana-e2e-media",
      BETTER_AUTH_SECRET: "e2e-only-secret-0123456789abcdefghijklmnop",
      ...(e2eDatabaseUrl ? { DATABASE_URL: e2eDatabaseUrl } : {}),
    },
  },
});
