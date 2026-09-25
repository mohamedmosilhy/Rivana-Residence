import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { accountsFor } from "./support/accounts";
import { signInAs, sql } from "./support/session";

test.skip(
  !process.env.E2E_DATABASE_URL,
  "Set E2E_DATABASE_URL to a disposable *_test database to run admin E2E.",
);

const CONTENT_DESTINATIONS = [
  "Pages",
  "Rooms",
  "Facilities",
  "Media",
  "Promotions",
  "Enquiries",
];

async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function openNavigation(page: Page, isMobile: boolean) {
  if (!isMobile) return page.getByRole("navigation", { name: "Admin" });
  await page.getByRole("button", { name: "Menu" }).click();
  return page.getByRole("dialog", { name: "Admin menu" });
}

test("editors navigate every content destination from the shell", async ({
  page,
  isMobile,
}, testInfo) => {
  await signInAs(page, accountsFor(testInfo.project.name).editor);

  await expect(
    page.getByRole("heading", { level: 1, name: "Overview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recently updated" }),
  ).toBeVisible();
  await expectNoAxeViolations(page);

  for (const destination of CONTENT_DESTINATIONS) {
    const nav = await openNavigation(page, isMobile);
    await nav.getByRole("link", { name: destination }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: destination }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Breadcrumb" })
        .getByRole("link", { name: "Overview" }),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
  }

  const nav = await openNavigation(page, isMobile);
  await expect(nav.getByRole("link", { name: "Enquiries" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Staff" })).toHaveCount(0);
});

test("editors cannot open settings directly", async ({ page }, testInfo) => {
  await signInAs(
    page,
    accountsFor(testInfo.project.name).editor,
    "/admin/settings",
  );

  await expect(
    page.getByRole("heading", { name: "You do not have access to this area" }),
  ).toBeVisible();
  await expect(page.getByLabel("Residence name")).toHaveCount(0);
});

test("the mobile menu is a modal sheet that returns focus", async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(!isMobile, "The sheet replaces the sidebar on small screens.");
  await signInAs(page, accountsFor(testInfo.project.name).editor);

  await expect(page.getByRole("navigation", { name: "Admin" })).toBeHidden();
  const trigger = page.getByRole("button", { name: "Menu" });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Admin menu" });
  await expect(sheet).toBeVisible();
  await expectNoAxeViolations(page);

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await sheet.getByRole("link", { name: "Rooms" }).click();
  await expect(page).toHaveURL(/\/admin\/rooms$/);
  await expect(sheet).toBeHidden();
});

test("the shell reflows at 200% zoom without horizontal scrolling", async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(isMobile, "Zoom is emulated from the desktop viewport.");
  await signInAs(page, accountsFor(testInfo.project.name).admin);

  // A 1280px-wide window at 200% zoom lays out at 640 CSS pixels.
  await page.setViewportSize({ width: 640, height: 400 });
  for (const path of ["/admin", "/admin/settings", "/admin/enquiries"]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});

test("keyboard users can reach content and the account menu", async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(isMobile, "Keyboard flow is exercised on desktop.");
  await signInAs(page, accountsFor(testInfo.project.name).editor);

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to admin content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#admin-content")).toBeFocused();

  const trigger = page.getByRole("button", { name: /account options/ });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Account and security" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
});

test("the destructive confirmation traps and returns focus", async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(isMobile, "Dialog keyboard flow is exercised on desktop.");
  await signInAs(page, accountsFor(testInfo.project.name).admin);
  await page.goto("/admin/account");

  const trigger = page.getByRole("button", { name: /Sign out other sessions/ });
  await expect(trigger).toBeVisible();
  // Other tests may hold sessions for this account; the dialog needs one.
  test.skip(await trigger.isDisabled(), "No other sessions to revoke.");
  await trigger.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expectNoAxeViolations(page);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("enquiries filter through the URL and render visitor input as text", async ({
  page,
}, testInfo) => {
  const marker = testInfo.project.name;
  await sql(
    `INSERT INTO "ContactEnquiry" (id, name, email, subject, message, status)
     VALUES ($1, $2, $3, $4, $5, 'NEW'), ($6, $7, $8, $9, $10, 'READ')
     ON CONFLICT (id) DO NOTHING`,
    [
      `e2e-new-${marker}`,
      `Layla ${marker}`,
      "layla@example.test",
      "<b>Airport</b> transfer",
      "<script>window.pwned = true</script>",
      `e2e-read-${marker}`,
      `Karim ${marker}`,
      "karim@example.test",
      "Late checkout",
      "Is late checkout possible?",
    ],
  );
  await signInAs(page, accountsFor(testInfo.project.name).editor);
  await page.goto("/admin/enquiries");

  await page.getByLabel("Search name, email, or subject").fill(marker);
  await page.getByLabel("Status").selectOption("NEW");
  await page.getByRole("button", { name: "Apply filters" }).click();

  await expect(page).toHaveURL(/status=NEW/);
  const table = page.getByRole("table", { name: "Contact enquiries" });
  await expect(table.getByRole("rowheader")).toHaveCount(1);
  await expect(table).toContainText(`Layla ${marker}`);
  await expect(table).toContainText("<b>Airport</b> transfer");
  expect(await page.evaluate(() => "pwned" in window)).toBe(false);
  await expectNoAxeViolations(page);

  await page.getByRole("link", { name: "Clear" }).click();
  await expect(page).toHaveURL(/\/admin\/enquiries$/);
});

test.describe("settings", () => {
  // One settings record is shared by every test, so these run in order and
  // only in one project.
  test.describe.configure({ mode: "serial" });
  test.skip(
    ({ isMobile }) => isMobile,
    "Settings writes run once, on desktop.",
  );

  test("administrators update settings and see them saved", async ({
    page,
  }, testInfo) => {
    await signInAs(
      page,
      accountsFor(testInfo.project.name).admin,
      "/admin/settings",
    );
    await expect(page.getByText("Not configured")).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByLabel("Tagline").fill("Quiet luxury in New Cairo");
    await page.getByLabel("Email").fill("stay@rivana.example");
    await page.getByLabel("Footer text").fill("© Rivana Residence");
    const save = page.getByRole("button", { name: "Save site details" });
    await save.click();

    await expect(
      page.getByRole("status").filter({ hasText: "Site details saved." }),
    ).toBeVisible();
    await expect(
      page.getByText(/Last saved .* by Amira Admin\./),
    ).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Tagline")).toHaveValue(
      "Quiet luxury in New Cairo",
    );
    await expect(page.getByLabel("Footer text")).toHaveValue(
      "© Rivana Residence",
    );
    const [row] = (
      await sql(`SELECT "footerText" FROM "SiteSettings" WHERE id = 'default'`)
    ).rows;
    expect(row).toEqual({ footerText: "© Rivana Residence" });
  });

  test("invalid settings are explained, focused, and not saved", async ({
    page,
  }, testInfo) => {
    await signInAs(
      page,
      accountsFor(testInfo.project.name).admin,
      "/admin/settings",
    );

    await page.getByLabel("Residence name").fill("");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Latitude").fill("120");
    await page.getByRole("button", { name: "Save site details" }).click();

    const summary = page.getByRole("alert").filter({
      hasText: "Some settings need attention.",
    });
    await expect(summary).toBeFocused();
    await expect(summary.getByRole("link")).toHaveCount(4);
    await expect(page.getByLabel("Email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    // What was typed survives the failed attempt.
    await expect(page.getByLabel("Email")).toHaveValue("not-an-email");
    await expectNoAxeViolations(page);

    await summary.getByRole("link", { name: /^Email:/ }).click();
    await expect(page.getByLabel("Email")).toBeFocused();

    const [row] = (
      await sql(`SELECT "siteName" FROM "SiteSettings" WHERE id = 'default'`)
    ).rows;
    expect(row).toEqual({ siteName: "Rivana Residence" });
  });

  test("a stale settings form cannot overwrite newer changes", async ({
    page,
  }, testInfo) => {
    await signInAs(
      page,
      accountsFor(testInfo.project.name).admin,
      "/admin/settings",
    );
    await sql(
      `UPDATE "SiteSettings" SET "updatedAt" = now() WHERE id = 'default'`,
    );

    await page.getByLabel("Tagline").fill("Stale edit");
    await page.getByRole("button", { name: "Save site details" }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: /Someone else saved/ }),
    ).toBeFocused();
  });

  test("administrators add, reorder, and save social links", async ({
    page,
  }, testInfo) => {
    await signInAs(
      page,
      accountsFor(testInfo.project.name).admin,
      "/admin/settings",
    );

    const add = page.getByRole("button", { name: "Add social link" });
    await add.click();
    await expect(page.locator("#social-0-platform")).toBeFocused();
    await page.locator("#social-0-url").fill("https://instagram.com/rivana");
    await add.click();
    await page.locator("#social-1-platform").selectOption("facebook");
    await page.locator("#social-1-url").fill("http://facebook.com/rivana");
    await page.getByRole("button", { name: "Save social links" }).click();

    const summary = page.getByRole("alert").filter({
      hasText: "Some social links need attention.",
    });
    await expect(summary).toBeFocused();
    await expect(summary).toContainText("Link 2 link:");

    await page.locator("#social-1-url").fill("https://facebook.com/rivana");
    await page.getByRole("button", { name: "Move up: Facebook" }).click();
    await page.getByRole("button", { name: "Save social links" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Social links saved." }),
    ).toBeVisible();

    const { rows } = await sql(
      `SELECT platform, "sortOrder" FROM "SocialLink" ORDER BY "sortOrder"`,
    );
    expect(rows).toEqual([
      { platform: "facebook", sortOrder: 0 },
      { platform: "instagram", sortOrder: 1 },
    ]);

    await page.reload();
    await expect(page.locator("#social-0-platform")).toHaveValue("facebook");
  });
});
