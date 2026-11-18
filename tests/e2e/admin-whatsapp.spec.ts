import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { accountsFor } from "./support/accounts";
import { signInAs, sql } from "./support/session";

// E2E-A-5 (M8-T4b): the Admin WhatsApp screen. The server runs a production
// build, where the fake provider is refused by design and no access token is
// set, so a test message ends in the "not configured" outcome here. The
// successful send is proven by the integration and unit tests.

test.skip(
  !process.env.E2E_DATABASE_URL,
  "Set E2E_DATABASE_URL to a disposable *_test database to run admin E2E.",
);

const PATH = "/admin/settings/whatsapp";

async function expectNoAxeViolations(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== "running"),
  );
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function resetWhatsApp() {
  await sql('DELETE FROM "WhatsAppTemplate"');
  await sql(
    `UPDATE "WhatsAppSettings"
     SET "businessPhoneNumber" = NULL, "providerPhoneNumberId" = NULL,
         "lastTestAt" = NULL, "lastTestOk" = NULL, "lastTestError" = NULL`,
  );
}

// The setup is one shared row, so the flow that changes it runs in one
// project only; every project still checks the read-only page.
test.describe("WhatsApp screen", () => {
  test.describe.configure({ mode: "serial" });

  test("an Admin sets up WhatsApp, adds a template, and tries a test message", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    await resetWhatsApp();
    await signInAs(page, accountsFor(testInfo.project.name).admin, PATH);

    await expect(
      page.getByRole("heading", { level: 1, name: "WhatsApp" }),
    ).toBeVisible();
    await expect(
      page.getByText("Not configured", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Not configured on the server")).toBeVisible();
    await expect(page.getByText("Verification code (English)")).toBeVisible();
    await expect(page.getByText("No templates yet")).toBeVisible();
    await expectNoAxeViolations(page);

    // Number and phone number id.
    await page
      .getByRole("textbox", { name: /Business WhatsApp number/ })
      .fill("+201001234567");
    await page
      .getByRole("textbox", { name: /Phone number id/ })
      .fill("109876543");
    await page.getByRole("button", { name: "Save setup" }).click();
    await expect(page.getByText("WhatsApp setup saved.")).toBeVisible();
    await expect(page.getByText("Entered").first()).toBeVisible();

    // A bad number is refused with an error summary that links to the field.
    await page
      .getByRole("textbox", { name: /Business WhatsApp number/ })
      .fill("not a number");
    await page.getByRole("button", { name: "Save setup" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "WhatsApp settings need" }),
    ).toContainText("Business WhatsApp number");

    // A template: the Meta name rule is explained next to the field.
    await page.getByLabel("Template name in Meta").fill("Bad Name");
    await page.getByLabel("Preview text").fill("Booking {{1}} confirmed.");
    await page.getByRole("button", { name: "Add template" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "template needs attention" }),
    ).toContainText("Template name in Meta");

    await page.getByLabel("Template name in Meta").fill("booking_confirmed_v1");
    await page.getByLabel("Preview text").fill("Booking {{1}} confirmed.");
    await page.getByLabel("Add a variable").selectOption("reference");
    await page.getByRole("button", { name: "Add template" }).click();
    await expect(page.getByText("Template added.")).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "WhatsApp templates" })
        .getByText("booking_confirmed_v1"),
    ).toBeVisible();
    // The booking confirmed gap closed; the verification code one is still open.
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Booking confirmed (English)" }),
    ).toHaveCount(0);
    await expect(page.getByText("Verification code (English)")).toBeVisible();

    // Edit the template from the table, then switch it off.
    await page.getByRole("link", { name: /Edit Booking confirmed/ }).click();
    await expect(
      page.getByRole("heading", { name: "Edit template" }),
    ).toBeVisible();
    await page.getByLabel("Active", { exact: true }).uncheck();
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByText("Template saved.")).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "WhatsApp templates" })
        .getByText("Inactive"),
    ).toBeVisible();

    // A test message: no access token in this build, so it explains the gap.
    await page.getByLabel("Send to").fill("+201001234567");
    await page.getByRole("button", { name: "Send test message" }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "no active WhatsApp template" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await expectNoHorizontalScroll(page);
  });

  test("online booking cannot be turned on while WhatsApp is not set up (Q-71)", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    await resetWhatsApp();
    await signInAs(page, accountsFor(testInfo.project.name).admin);
    const branchId = (
      await sql('SELECT id FROM "Branch" WHERE slug = $1', ["new-cairo"])
    ).rows[0].id;
    const result = await page.evaluate(async (id) => {
      const response = await fetch(`/api/v1/staff/branches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onlineBookingEnabled: true }),
      });
      return { status: response.status, body: await response.json() };
    }, branchId);
    expect(result.status).toBe(422);
    expect(result.body.fieldErrors.onlineBookingEnabled).toEqual([
      "Online booking can't be turned on until WhatsApp messaging is set up.",
    ]);
    const stored = await sql(
      'SELECT "onlineBookingEnabled" FROM "Branch" WHERE id = $1',
      [branchId],
    );
    expect(stored.rows[0].onlineBookingEnabled).toBe(false);
  });

  test("the page is usable at the project's viewport", async ({
    page,
  }, testInfo) => {
    await signInAs(page, accountsFor(testInfo.project.name).admin, PATH);
    await expect(
      page.getByRole("heading", { level: 1, name: "WhatsApp" }),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
  });

  test("Settings links to the WhatsApp page", async ({ page }, testInfo) => {
    await signInAs(
      page,
      accountsFor(testInfo.project.name).admin,
      "/admin/settings",
    );
    await page.getByRole("link", { name: "Open WhatsApp setup" }).click();
    await expect(page).toHaveURL(new RegExp(`${PATH}$`));
  });

  test("an Editor is denied the page", async ({ page }, testInfo) => {
    await signInAs(page, accountsFor(testInfo.project.name).editor);
    await page.goto(PATH);
    await expect(
      page.getByRole("heading", {
        name: "You do not have access to this area",
      }),
    ).toBeVisible();
  });
});

// Fields that share a row in a multi column form line up: their controls
// start at the same height even when one field has a hint and its neighbour
// has none. A grid is a `formGrid` (auto-fit columns).
const FORM_PAGES = [
  "/admin/settings/whatsapp",
  "/admin/settings",
  "/admin/branches/new",
  "/admin/rooms/new",
];

for (const path of FORM_PAGES) {
  test(`fields in one row are aligned on ${path}`, async ({
    page,
    isMobile,
  }, testInfo) => {
    test.skip(isMobile, "One column on a phone.");
    await signInAs(page, accountsFor(testInfo.project.name).admin, path);
    const misaligned = await page.evaluate(() => {
      const problems: string[] = [];
      const grids = document.querySelectorAll<HTMLElement>(
        '[class*="grid-cols-[repeat(auto-fit"]',
      );
      for (const grid of grids) {
        const rows = new Map<number, HTMLElement[]>();
        for (const child of Array.from(grid.children) as HTMLElement[]) {
          const top = Math.round(child.getBoundingClientRect().top);
          rows.set(top, [...(rows.get(top) ?? []), child]);
        }
        for (const children of rows.values()) {
          const tops = children
            .map((child) => child.querySelector("input,select,textarea"))
            .filter((control): control is Element => control !== null)
            .map((control) => control.getBoundingClientRect().top);
          if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 1) {
            problems.push(
              children
                .map((child) => child.textContent?.slice(0, 30))
                .join(" | "),
            );
          }
        }
      }
      return problems;
    });
    expect(misaligned).toEqual([]);
  });
}
