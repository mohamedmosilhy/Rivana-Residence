import { expect, test } from "@playwright/test";

test.skip(
  !process.env.E2E_DATABASE_URL,
  "Set E2E_DATABASE_URL to a disposable *_test database to run visual checks.",
);

// Opening-screen baselines for every public template. Only the first
// viewport is compared: it holds the hero, header state, and typography that
// define each template, and stays stable as catalogue content grows.
const TEMPLATES = [
  // Branch URLs since M5 (spec 0002); one active branch, so the header has
  // no switcher and matches the earlier design.
  { name: "home", path: "/new-cairo" },
  { name: "about", path: "/new-cairo/about" },
  { name: "rooms", path: "/new-cairo/stay" },
  { name: "room-detail", path: "/new-cairo/stay/studio-with-balcony" },
  { name: "facilities", path: "/new-cairo/facilities" },
  { name: "facility-detail", path: "/new-cairo/facilities/swimming-pool" },
  { name: "contact", path: "/new-cairo/contact" },
  { name: "not-found", path: "/new-cairo/not-a-page" },
] as const;

for (const template of TEMPLATES) {
  test(`${template.name} opening screen matches the approved design`, async ({
    page,
  }) => {
    await page.goto(template.path);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${template.name}.png`, {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
    });
  });
}
