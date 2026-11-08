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
    cookie.name.endsWith("rivana-staff.session_token"),
  );
  expect(session).toMatchObject({
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: true,
  });
  expect(session?.domain).toBe("127.0.0.1");

  // F02: browser fetch must carry the real cookie to the staff REST API.
  const api = await page.evaluate(async () => {
    const response = await fetch("/api/v1/staff/branches");
    return { status: response.status, body: await response.json() };
  });
  expect(api.status).toBe(200);
  expect(api.body.items).toEqual(
    expect.arrayContaining([expect.objectContaining({ slug: "new-cairo" })]),
  );

  // Public rendering stays anonymous even when the root cookie is sent.
  await page.goto("/new-cairo");
  expect(await page.content()).not.toContain(admin);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("a retired admin cookie cannot shadow the new staff session", async ({
  page,
  context,
}, testInfo) => {
  const { admin } = accountsFor(testInfo.project.name);
  await page.goto("/admin/login");
  await signIn(page, admin);
  await expect(page).toHaveURL(/\/admin$/);
  const current = (await context.cookies()).find((cookie) =>
    cookie.name.endsWith("rivana-staff.session_token"),
  );
  expect(current).toBeDefined();
  if (!current) throw new Error("Sign-in did not set the staff cookie.");

  // Reuse a genuinely valid session as the old deployment's /admin cookie.
  await context.clearCookies();
  await context.addCookies([
    {
      ...current,
      name: current.name.replace("rivana-staff", "rivana"),
      path: "/admin",
    },
  ]);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await signIn(page, admin);
  await expect(page).toHaveURL(/\/admin$/);

  const response = await page.evaluate(
    async () => (await fetch("/api/v1/staff/branches")).status,
  );
  expect(response).toBe(200);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
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
  expect(
    await page.evaluate(
      async () => (await fetch("/api/v1/staff/branches")).status,
    ),
  ).toBe(401);

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
  browser,
}, testInfo) => {
  const { account } = accountsFor(testInfo.project.name);
  await page.goto("/admin/login?returnTo=%2Fadmin%2Faccount");
  await signIn(page, account);
  await expect(
    page.getByRole("heading", { name: "Active sessions" }),
  ).toBeVisible();
  const sessionCookies = await page.context().cookies();

  // Revoke every session behind the browser's back, then use the stale page.
  await sql(
    'DELETE FROM "Session" WHERE "userId" = (SELECT id FROM "User" WHERE email = $1)',
    [account],
  );
  // The REST lookup clears invalid cookies. Use an independent browser
  // context so the original stale form still exercises its own auth guard.
  const replay = await browser.newContext();
  try {
    await replay.addCookies(sessionCookies);
    const replayPage = await replay.newPage();
    await replayPage.goto("/new-cairo");
    expect(
      await replayPage.evaluate(
        async () => (await fetch("/api/v1/staff/branches")).status,
      ),
    ).toBe(401);
  } finally {
    await replay.close();
  }
  await page.getByLabel("Current password").fill(E2E_PASSWORD);
  await page.getByLabel("New password").fill("Granite-harbour-sunrise-7");
  await page.getByRole("button", { name: "Change password" }).click();

  await expect(page).toHaveURL(/\/admin\/login/);
});
