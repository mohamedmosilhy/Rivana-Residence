import { defineConfig, devices } from "@playwright/test";
import { E2E_PHONE_VERIFICATION_SECRET } from "./tests/e2e/support/phone-verification";

const port = 3100;
const e2eDatabaseUrl = process.env.E2E_DATABASE_URL;
const bookingSearch = process.env.BOOKING_SEARCH_E2E === "1";
// Journeys that need a provider run on the development server: the production
// server refuses the fake WhatsApp, email and payment providers. No other
// `next dev` may be running in this checkout meanwhile.
const bookingJourney = process.env.BOOKING_JOURNEY_E2E === "1";
if ((bookingSearch || bookingJourney) && !e2eDatabaseUrl) {
  throw new Error("The focused booking runs require E2E_DATABASE_URL.");
}
if (bookingSearch && bookingJourney) {
  throw new Error("Run BOOKING_SEARCH_E2E and BOOKING_JOURNEY_E2E separately.");
}
/** The one spec file of a focused booking run. */
const focused = bookingSearch
  ? /booking-search\.spec/
  : bookingJourney
    ? /booking-journey\.spec/
    : null;

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
  // see a stable, published site; visual baselines follow; the branch
  // websites suite runs last because it activates a second branch, which
  // turns `/` into the chooser (spec 0002).
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [
        /public-site\.spec/,
        /branch-websites\.spec/,
        /visual\.spec/,
      ],
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
      testIgnore: [
        /public-site\.spec/,
        /branch-websites\.spec/,
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
      name: "branches",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /branch-websites\.spec/,
      dependencies: [
        "visual-desktop",
        "visual-mobile",
        ...CROSS_BROWSER_PROJECTS.map((project) => project.name),
      ],
    },
  ]
    .filter(
      (project) =>
        !focused ||
        ["desktop-chromium", "mobile-chromium"].includes(project.name) ||
        project.name.startsWith("webkit-"),
    )
    .map((project, index) =>
      focused
        ? {
            ...project,
            testMatch: focused,
            use: {
              ...project.use,
              extraHTTPHeaders: { "X-Forwarded-For": `192.0.2.${index + 1}` },
            },
          }
        : project,
    ),
  webServer: {
    // The data cache persists on disk between runs, but the test database is
    // rebuilt out of band on every run, so start from an empty cache.
    // A development cache left from before a production build can make every
    // page reload without end, so the journey run starts without one.
    command: bookingJourney
      ? `rm -rf .next/dev && npm run dev -- --hostname 127.0.0.1 --port ${port}`
      : `npm run build && rm -rf .next/cache/fetch-cache && npm run start -- --hostname 127.0.0.1 --port ${port}`,
    reuseExistingServer: !process.env.CI && !focused,
    timeout: 180_000,
    // An uncached page: the readiness probe must not fill the content cache.
    url: `http://127.0.0.1:${port}/admin/login`,
    env: {
      APP_URL: `http://127.0.0.1:${port}`,
      MEDIA_STORAGE_ROOT: "/tmp/rivana-e2e-media",
      CONTACT_DELIVERY: "outbox",
      CONTACT_OUTBOX_DIR: "/tmp/rivana-e2e-outbox",
      BETTER_AUTH_SECRET: "e2e-only-secret-0123456789abcdefghijklmnop",
      PHONE_VERIFICATION_SECRET: E2E_PHONE_VERIFICATION_SECRET,
      // API fixtures can simulate separate clients on this loopback-only server.
      AUTH_TRUST_PROXY_HEADERS: "true",
      ANALYTICS_ENABLED: "true",
      // The focused search run only reads readiness. The value is fictional
      // and the scenario never sends a code or calls a provider.
      ...(bookingSearch
        ? { WHATSAPP_ACCESS_TOKEN: "e2e-search-readiness-only" }
        : {}),
      // Fictional only. Nothing reaches a provider.
      ...(bookingJourney
        ? {
            WHATSAPP_PROVIDER: "fake",
            EMAIL_PROVIDER: "fake",
            PAYMENT_PROVIDER: "fake",
          }
        : {}),
      ...(e2eDatabaseUrl ? { DATABASE_URL: e2eDatabaseUrl } : {}),
    },
  },
});
