import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_PASSWORD, accountsFor } from "./support/accounts";

test.skip(
  !process.env.E2E_DATABASE_URL,
  "Set E2E_DATABASE_URL to a disposable *_test database to run auth E2E.",
);

const INVALID =
  "The email or password is incorrect, or the account cannot sign in.";

async function signIn(page: Page, email: string, password = E2E_PASSWORD) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function sql(query: string, values: unknown[]) {
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query(query, values);
  } finally {
    await client.end();
  }
}

test("signs in, returns to the requested page, and sets hardened cookies", async ({
  page,
  context,
}, testInfo) => {
  const { admin } = accountsFor(testInfo.project.name);

  await page.goto("/admin/staff");
  await expect(page).toHaveURL(/\/admin\/login\?returnTo=%2Fadmin%2Fstaff$/);
  await signIn(page, admin);

  await expect(page).toHaveURL(/\/admin\/staff$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Staff" }),
  ).toBeVisible();

  const [session] = (await context.cookies()).filter((cookie) =>
    cookie.name.endsWith("rivana.session_token"),
  );
  expect(session).toMatchObject({
    httpOnly: true,
    sameSite: "Lax",
    path: "/admin",
  });
  expect(session?.domain).toBe("127.0.0.1");

  // The admin-scoped cookie is never sent to public pages.
  const publicRequest = page.waitForRequest((request) =>
    request.url().endsWith("/"),
  );
  await page.goto("/");
  expect((await publicRequest).headers().cookie ?? "").not.toContain(
    "session_token",
  );

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("shows one generic, focused, accessible error for any failed sign-in", async ({
  page,
}, testInfo) => {
  const { editor } = accountsFor(testInfo.project.name);
  await page.goto("/admin/login");

  await signIn(page, editor, "not-the-right-password");
  const alert = page.locator("#login-error");
  await expect(alert).toHaveText(INVALID);
  await expect(alert).toBeFocused();
  await expect(page.getByLabel("Email")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  // The email survives the failed attempt; the password never does.
  await expect(page.getByLabel("Email")).toHaveValue(editor);
  await expect(page.getByLabel("Password")).toHaveValue("");

  await signIn(page, `nobody-${testInfo.project.name}@example.test`);
  await expect(page.locator("#login-error")).toHaveText(INVALID);
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("inactive accounts cannot sign in", async ({ page }, testInfo) => {
  const { inactive } = accountsFor(testInfo.project.name);
  await page.goto("/admin/login");

  await signIn(page, inactive);

  await expect(page.locator("#login-error")).toHaveText(INVALID);
});

test("locks an account after repeated failures", async ({ page }, testInfo) => {
  const { lockout } = accountsFor(testInfo.project.name);
  await page.goto("/admin/login");

  const submit = page.getByRole("button", { name: "Sign in", exact: true });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await signIn(page, lockout, `wrong-password-${attempt}`);
    // Wait for the round trip so the next attempt is not typed into a form
    // that React is about to reset.
    await expect(submit).toBeEnabled();
    await expect(page.locator("#login-error")).toHaveText(INVALID);
  }
  await signIn(page, lockout);

  await expect(page.locator("#login-error")).toHaveText(
    /Too many sign-in attempts/,
  );
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("ignores external return URLs", async ({ page }, testInfo) => {
  const { editor } = accountsFor(testInfo.project.name);
  await page.goto("/admin/login?returnTo=https://evil.example/admin");

  await signIn(page, editor);

  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/admin$/);
});

test("supports a keyboard-only sign-in", async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(isMobile, "Keyboard flow is exercised on desktop.");
  const { editor } = accountsFor(testInfo.project.name);
  await page.goto("/admin/login");

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.keyboard.type(editor);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();
  await page.keyboard.type(E2E_PASSWORD);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/admin$/);
});

test("signs out and the old session cookie stops working", async ({
  page,
  context,
  browser,
}, testInfo) => {
  const { editor } = accountsFor(testInfo.project.name);
  await page.goto("/admin/login");
  await signIn(page, editor);
  await expect(page).toHaveURL(/\/admin$/);
  const stolen = await context.cookies();

  await page.getByRole("button", { name: /account options/ }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);

  const replay = await browser.newContext();
  await replay.addCookies(stolen);
  const replayPage = await replay.newPage();
  await replayPage.goto("/admin");
  await expect(replayPage).toHaveURL(/\/admin\/login$/);
  await replay.close();
});

test("editors are denied administrator-only pages", async ({
  page,
}, testInfo) => {
  const { editor } = accountsFor(testInfo.project.name);
  await page.goto("/admin/login?returnTo=%2Fadmin%2Fstaff");
  await signIn(page, editor);

  await expect(
    page.getByRole("heading", { name: "You do not have access to this area" }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: /@example\.test/ })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: "Staff" })).toHaveCount(0);
});

test("signed-in staff visiting the login page are sent to the admin", async ({
  page,
}, testInfo) => {
  const { editor } = accountsFor(testInfo.project.name);
  await page.goto("/admin/login");
  await signIn(page, editor);
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/admin/login");

  await expect(page).toHaveURL(/\/admin$/);
});

test("a revoked session cannot run a protected Server Action", async ({
  page,
}, testInfo) => {
  const { account } = accountsFor(testInfo.project.name);
  await page.goto("/admin/login?returnTo=%2Fadmin%2Faccount");
  await signIn(page, account);
  await expect(
    page.getByRole("heading", { name: "Active sessions" }),
  ).toBeVisible();

  // Revoke every session behind the browser's back, then use the stale page.
  await sql(
    'DELETE FROM "Session" WHERE "userId" = (SELECT id FROM "User" WHERE email = $1)',
    [account],
  );
  await page.getByLabel("Current password").fill(E2E_PASSWORD);
  await page.getByLabel("New password").fill("Granite-harbour-sunrise-7");
  await page.getByRole("button", { name: "Change password" }).click();

  await expect(page).toHaveURL(/\/admin\/login/);
});
