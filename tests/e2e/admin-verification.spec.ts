import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { accountsFor } from "./support/accounts";
import { signInAs, sql } from "./support/session";

// Q-99 (M9-T12a): the Admin Guest verification screen. The server runs a
// production build with no SMTP settings, so email delivery is not configured
// and turning email codes on is refused here. Turning them on with delivery
// configured is proven by the integration tests.

test.skip(
  !process.env.E2E_DATABASE_URL,
  "Set E2E_DATABASE_URL to a disposable *_test database to run admin E2E.",
);

const PATH = "/admin/settings/verification";

async function expectNoAxeViolations(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.playState !== "running"),
  );
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations).toEqual([]);
}

test.describe("Guest verification screen", () => {
  test.describe.configure({ mode: "serial" });

  test("an Admin cannot turn email codes on while email delivery is not set up", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium");
    await sql('UPDATE "VerificationSettings" SET "emailEnabled" = false');
    await signInAs(page, accountsFor(testInfo.project.name).admin, PATH);
    await expect(
      page.getByRole("heading", { level: 1, name: "Guest verification" }),
    ).toBeVisible();
    await expect(page.getByText("No channel ready")).toBeVisible();
    await expect(
      page.getByText("Online payment", { exact: true }),
    ).toBeVisible();
    const box = page.getByRole("checkbox", {
      name: "Allow verification codes by email",
    });
    await expect(box).not.toBeChecked();
    await expectNoAxeViolations(page);

    await box.check();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page
        .getByText(
          "Email verification can't be turned on until email delivery is set up.",
        )
        .first(),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Email verification can't be turned on until online payment is set up: bookings verified by email are paid online.",
        { exact: true },
      ),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    const stored = await sql(
      'SELECT "emailEnabled" FROM "VerificationSettings"',
    );
    expect(stored.rows[0].emailEnabled).toBe(false);
  });

  test("the page is usable at the project's viewport", async ({
    page,
  }, testInfo) => {
    await signInAs(page, accountsFor(testInfo.project.name).admin, PATH);
    await expect(
      page.getByRole("heading", { level: 1, name: "Guest verification" }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expectNoAxeViolations(page);
  });

  test("Settings links to the Guest verification page", async ({
    page,
  }, testInfo) => {
    await signInAs(
      page,
      accountsFor(testInfo.project.name).admin,
      "/admin/settings",
    );
    await page.getByRole("link", { name: "Open guest verification" }).click();
    await expect(page).toHaveURL(new RegExp(`${PATH}$`));
  });

  test("an Editor is denied the page and the API", async ({
    page,
  }, testInfo) => {
    await signInAs(page, accountsFor(testInfo.project.name).editor);
    await page.goto(PATH);
    await expect(
      page.getByRole("heading", {
        name: "You do not have access to this area",
      }),
    ).toBeVisible();
    const status = await page.evaluate(async () => {
      const response = await fetch("/api/v1/staff/settings/verification", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailVerificationEnabled: true }),
      });
      return response.status;
    });
    expect(status).toBe(403);
  });
});
