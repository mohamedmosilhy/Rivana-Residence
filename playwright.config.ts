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
  // Admin suites run first; the public-site suites depend on them so they
  // see a stable, published site; the promotion suite runs last because an
  // active campaign opens a modal on every public page.
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [/public-site\.spec/, /promotion-popup\.spec/],
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
      testIgnore: [/public-site\.spec/, /promotion-popup\.spec/],
    },
    {
      name: "public-desktop",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /public-site\.spec/,
      dependencies: ["desktop-chromium", "mobile-chromium"],
    },
    {
      name: "public-mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: /public-site\.spec/,
      dependencies: ["desktop-chromium", "mobile-chromium"],
    },
    {
      name: "promotions",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /promotion-popup\.spec/,
      dependencies: ["public-desktop", "public-mobile"],
    },
  ],
  webServer: {
    // The data cache persists on disk between runs, but the test database is
    // rebuilt out of band on every run, so start from an empty cache.
    command: `npm run build && rm -rf .next/cache/fetch-cache && npm run start -- --hostname 127.0.0.1 --port ${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // An uncached page: the readiness probe must not fill the content cache.
    url: `http://127.0.0.1:${port}/admin/login`,
    env: {
      APP_URL: `http://127.0.0.1:${port}`,
      MEDIA_STORAGE_ROOT: "/tmp/rivana-e2e-media",
      CONTACT_DELIVERY: "outbox",
      CONTACT_OUTBOX_DIR: "/tmp/rivana-e2e-outbox",
      BETTER_AUTH_SECRET: "e2e-only-secret-0123456789abcdefghijklmnop",
      ...(e2eDatabaseUrl ? { DATABASE_URL: e2eDatabaseUrl } : {}),
    },
  },
});
