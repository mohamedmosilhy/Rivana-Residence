import { expect, test, type Page } from "@playwright/test";

import { E2E_PASSWORD, accountsFor } from "./support/accounts";
import { sql } from "./support/session";

// E2E-A-2 (first part) and AC-4: Receptionists and Managers sign in, see no
// CMS destinations, and are refused on every CMS route and action. Their
// enquiry list is limited to their branches (Q-26), so it is empty in M4.

const CMS_ROUTES = [
  "/admin/pages",
  "/admin/pages/home",
  "/admin/rooms",
  "/admin/rooms/new",
  "/admin/facilities",
  "/admin/facilities/new",
  "/admin/media",
  "/admin/branches",
  "/admin/branches/new",
  "/admin/settings",
  "/admin/staff",
];

async function signIn(page: Page, email: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

for (const role of ["receptionist", "manager"] as const) {
  test.describe(`${role} access`, () => {
    test(`a ${role} sees only the staff home and enquiries`, async ({
      page,
    }, testInfo) => {
      await signIn(page, accountsFor(testInfo.project.name)[role]);

      await expect(page.getByTestId("staff-home")).toBeVisible();
      await expect(
        page.getByText("Front desk tools will appear here in a later release."),
      ).toBeVisible();
      // No CMS counts or shortcuts on the staff home.
      await expect(
        page.getByRole("navigation", { name: "Shortcuts" }),
      ).toHaveCount(0);

      const navigation = page.getByRole("navigation", { name: "Admin" });
      if (await navigation.isVisible()) {
        await expect(navigation.getByRole("link")).toHaveText([
          "Overview",
          "Enquiries",
        ]);
      }
      for (const label of [
        "Pages",
        "Rooms",
        "Facilities",
        "Media",
        "Branches",
        "Settings",
        "Staff",
      ]) {
        await expect(
          page.getByRole("link", { name: label, exact: true }),
        ).toHaveCount(0);
      }

      await page.goto("/admin/enquiries");
      await expect(
        page.getByRole("heading", { name: "Enquiries", level: 1 }),
      ).toBeVisible();
      await expect(page.getByText("No enquiries yet")).toBeVisible();
    });

    test(`a ${role} is denied every CMS route`, async ({ page }, testInfo) => {
      await signIn(page, accountsFor(testInfo.project.name)[role]);
      for (const route of CMS_ROUTES) {
        await page.goto(route);
        await expect(
          page.getByRole("heading", {
            name: "You do not have access to this area",
          }),
          route,
        ).toBeVisible();
      }
    });
  });
}

test("a receptionist session cannot run a CMS action", async ({
  browser,
}, testInfo) => {
  const accounts = accountsFor(testInfo.project.name);
  const receptionistContext = await browser.newContext();
  const adminContext = await browser.newContext();
  try {
    // A receptionist session cookie, taken from a real sign-in.
    const receptionistPage = await receptionistContext.newPage();
    await signIn(receptionistPage, accounts.receptionist);
    const receptionistCookies = (await receptionistContext.cookies()).filter(
      (cookie) => cookie.name.endsWith("rivana.session_token"),
    );
    expect(receptionistCookies).toHaveLength(1);

    // Load the CMS form as an administrator, then submit it as the
    // receptionist: the Server Action re-checks the role on the server.
    const page = await adminContext.newPage();
    await signIn(page, accounts.admin);
    await page.goto("/admin/rooms/new");
    await expect(page.getByLabel("Branch")).toHaveValue(/.+/);
    await adminContext.clearCookies();
    await adminContext.addCookies(receptionistCookies);

    const slug = `forbidden-${testInfo.project.name}`;
    await page.getByLabel("Name").fill("Forbidden Room");
    await page.getByLabel("Web address").fill(slug);
    await page.getByLabel("Short description").fill("Should never be saved.");
    await page
      .getByLabel("Description", { exact: true })
      .fill("Should never be saved.");
    await page.getByRole("button", { name: "Create draft" }).click();

    await expect(
      page.getByText("Your role does not allow this action.").first(),
    ).toBeVisible();
    const { rows } = await sql(
      'SELECT count(*)::int AS n FROM "Room" WHERE slug = $1',
      [slug],
    );
    expect(rows[0].n).toBe(0);
  } finally {
    await receptionistContext.close();
    await adminContext.close();
  }
});
