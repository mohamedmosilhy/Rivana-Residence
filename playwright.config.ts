import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const e2eDatabaseUrl = process.env.E2E_DATABASE_URL;

// Release acceptance (`npm run test:e2e:browsers`) repeats the public,
// shell, and security suites in Firefox and WebKit at phone, tablet, and
// desktop sizes. Admin journeys stay on Chromium: production cookies are
// Secure, and WebKit will not keep them on plain-HTTP 127.0.0.1.
const crossBrowser = process.env.CROSS_BROWSER === "1";
const CROSS_BROWSER_PROJECTS = crossBrowser
  ? [
      { name: "firefox-desktop", device: devices["Desktop Firefox"] },
      { name: "webkit-desktop", device: devices["Desktop Safari"] },
      { name: "webkit-tablet", device: devices["iPad (gen 7)"] },
      { name: "webkit-phone", device: devices["iPhone 14"] },
    ].map(({ name, device }) => ({
      name,
      use: { ...device },
      testMatch: [/public-site\.spec/, /shells\.spec/, /security\.spec/],
      dependencies: ["desktop-chromium", "mobile-chromium"],
    }))
  : [];

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
  // see a stable, published site; visual baselines follow; the promotion
  // suite runs last because an active campaign opens a modal on every page.
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [
        /public-site\.spec/,
        /promotion-popup\.spec/,
        /visual\.spec/,
      ],
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
      testIgnore: [
        /public-site\.spec/,
        /promotion-popup\.spec/,
        /visual\.spec/,
      ],
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
      name: "visual-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
      testMatch: /visual\.spec/,
      dependencies: ["public-desktop", "public-mobile"],
    },
    {
      name: "visual-mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: /visual\.spec/,
      dependencies: ["public-desktop", "public-mobile"],
    },
    ...CROSS_BROWSER_PROJECTS,
    {
      name: "promotions",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /promotion-popup\.spec/,
      dependencies: [
        "visual-desktop",
        "visual-mobile",
        ...CROSS_BROWSER_PROJECTS.map((project) => project.name),
      ],
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
