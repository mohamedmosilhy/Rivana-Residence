const mobile = process.env.LHCI_PROFILE === "mobile";

module.exports = {
  ci: {
    collect: {
      startServerCommand: "npm run start -- --hostname 127.0.0.1 --port 3200",
      startServerReadyPattern: "Ready in",
      startServerReadyTimeout: 120000,
      url: [
        "http://127.0.0.1:3200/",
        "http://127.0.0.1:3200/rooms",
        "http://127.0.0.1:3200/rooms/studio-with-balcony",
        "http://127.0.0.1:3200/contact",
      ],
      numberOfRuns: 1,
      settings: mobile
        ? { chromeFlags: "--headless --no-sandbox" }
        : {
            preset: "desktop",
            chromeFlags: "--headless --no-sandbox",
          },
    },
    assert: {
      assertions: {
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["error", { minScore: 0.9 }],
        "categories:seo": ["error", { minScore: 0.95 }],
        "categories:performance": ["warn", { minScore: 0.8 }],
        "largest-contentful-paint": ["warn", { maxNumericValue: 3500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["warn", { maxNumericValue: 400 }],
        "resource-summary:script:size": ["warn", { maxNumericValue: 260000 }],
      },
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci" },
  },
};
