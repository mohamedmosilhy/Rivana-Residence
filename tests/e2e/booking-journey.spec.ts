import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { localDateAt } from "../../src/domain/shared/zoned-time";

import { setKnownCode, verifyAccessibility } from "./support/booking";
import { sql } from "./support/session";

// M10-T4, E2E-G-5 (booking part) on the development server with fake
// providers. Run with BOOKING_JOURNEY_E2E=1 and E2E_DATABASE_URL.
test.skip(
  process.env.BOOKING_JOURNEY_E2E !== "1",
  "Run the focused BOOKING_JOURNEY_E2E=1 journey suite.",
);
// The development server compiles each page on its first visit.
test.describe.configure({ timeout: 90_000 });

const code = "482913";
const projects = [
  "desktop-chromium",
  "mobile-chromium",
  "webkit-desktop",
  "webkit-tablet",
  "webkit-phone",
];
/** A fictional number and address of its own for each project and test. */
function guest(testInfo: TestInfo, scenario: number) {
  const number = scenario * 10 + projects.indexOf(testInfo.project.name);
  const local = `555-01${String(number).padStart(2, "0")}`;
  return {
    fullName: "Amina Hassan",
    email: `amina.${number}@example.test`,
    typed: `(202) ${local}`,
    phone: `+1202${local.replace("-", "")}`,
  };
}
type Guest = ReturnType<typeof guest>;

function detailsPage() {
  const from = localDateAt(new Date(), "Africa/Cairo");
  const query = new URLSearchParams({
    checkIn: from.addDays(20).value,
    checkOut: from.addDays(22).value,
    u: "deluxe-double.2.0",
  });
  return `/new-cairo/book/details?${query}`;
}

const heading = (page: Page, name: string) =>
  page.getByRole("heading", { name });
const button = (page: Page, name: string) => page.getByRole("button", { name });

async function fillDetails(page: Page, who: Guest) {
  await page.goto(detailsPage());
  await page.getByLabel("Full name").fill(who.fullName);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Phone country").selectOption("US");
  await page.getByLabel("Phone number").fill(who.typed);
  await button(page, "Continue to verification").click();
  await expect(heading(page, "Verify your contact")).toBeVisible();
}

/** Presses `name` and returns the id of the code the server created. */
async function requestCode(page: Page, name = "Send code") {
  const answer = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/phone-verifications"),
  );
  await button(page, name).click();
  const response = await answer;
  expect(response.status()).toBe(201);
  await expect(page.getByLabel("Verification code")).toBeVisible();
  return ((await response.json()) as { verificationId: string }).verificationId;
}

async function enterCode(page: Page, value: string) {
  await page.getByLabel("Verification code").fill(value);
  await button(page, "Verify code").click();
}

async function capture(page: Page, testInfo: TestInfo, state: string) {
  const directory = process.env.BOOKING_JOURNEY_SCREENSHOTS;
  if (!directory || !testInfo.project.name.endsWith("chromium")) return;
  const desktop = testInfo.project.name === "desktop-chromium";
  const previous = page.viewportSize()!;
  await page.setViewportSize(
    desktop ? { width: 1280, height: 920 } : { width: 390, height: 844 },
  );
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo({ top: 0, behavior: "instant" });
    await document.fonts.ready;
  });
  await mkdir(directory, { recursive: true });
  await page.screenshot({
    path: path.join(
      directory,
      `${state}-${desktop ? "desktop" : "mobile"}.png`,
    ),
    fullPage: true,
    animations: "disabled",
    scale: "css",
    // The development server's badge is not part of the page.
    style: "nextjs-portal { display: none !important; }",
  });
  await page.setViewportSize(previous);
}

test("AC-9, AC-13: a guest verifies by WhatsApp with the keyboard, and the token stays in memory", async ({
  page,
  browserName,
}, testInfo) => {
  const who = guest(testInfo, 1);
  const requested: string[] = [];
  const logged: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  page.on("console", (message) => logged.push(message.text()));
  const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";

  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(detailsPage());
  await expect(heading(page, "Your details")).toBeVisible();
  await verifyAccessibility(page);
  await capture(page, testInfo, "details-form");

  await button(page, "Continue to verification").press("Enter");
  const summary = page.getByRole("alert").filter({
    hasText: "Check your details",
  });
  await expect(summary).toBeFocused();
  await verifyAccessibility(page);
  await capture(page, testInfo, "details-errors");

  const name = page.getByLabel("Full name");
  await name.focus();
  await page.keyboard.type(who.fullName);
  await page.keyboard.press(tab);
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.keyboard.type(who.email);
  await page.keyboard.press(tab);
  await expect(page.getByLabel("Phone country")).toBeFocused();
  await page.getByLabel("Phone country").selectOption("US");
  await page.keyboard.press(tab);
  await expect(page.getByLabel("Phone number")).toBeFocused();
  await page.keyboard.type(who.typed);
  await page.keyboard.press(tab);
  await expect(page.getByLabel(/Special requests/)).toBeFocused();
  await page.keyboard.type("A quiet room");
  await page.keyboard.press("Enter");
  await page.keyboard.type("A late arrival");
  await page.keyboard.press(tab);
  await expect(button(page, "Continue to verification")).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(heading(page, "Verify your contact")).toBeFocused();
  await expect(page.getByRole("radio", { name: /WhatsApp to/ })).toBeChecked();
  await verifyAccessibility(page);
  await capture(page, testInfo, "verify-choose-channel");

  const sent = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/phone-verifications"),
  );
  await button(page, "Send code").press("Enter");
  const verificationId = (
    (await (await sent).json()) as { verificationId: string }
  ).verificationId;
  await setKnownCode(verificationId, code);
  await expect(page.getByLabel("Verification code")).toBeFocused();
  await verifyAccessibility(page);
  await capture(page, testInfo, "verify-enter-code");

  // A screenshot takes the focus away; the page had put it here.
  await page.getByLabel("Verification code").focus();
  await page.keyboard.type("000000");
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("That code is not correct. 4 attempts left."),
  ).toBeVisible();
  await verifyAccessibility(page);
  await capture(page, testInfo, "verify-wrong-code");

  const confirmed = page.waitForResponse((response) =>
    response.url().endsWith("/confirmation"),
  );
  await page.getByLabel("Verification code").fill(code);
  await page.keyboard.press("Enter");
  const { token } = (await (await confirmed).json()) as { token: string };
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await expect(heading(page, "Phone verified")).toBeFocused();
  await expect(
    page.getByText("Extras and payment are coming soon."),
  ).toBeVisible();
  await verifyAccessibility(page);
  await capture(page, testInfo, "verify-phone-verified");

  // AC-13: not in storage, cookies, the address, the page, a request address,
  // the console, or the website events.
  const browserState = await page.evaluate(() =>
    JSON.stringify([
      { ...sessionStorage },
      { ...localStorage },
      document.cookie,
      location.href,
      document.documentElement.outerHTML,
    ]),
  );
  for (const text of [browserState, requested.join(), logged.join()]) {
    expect(text).not.toContain(token);
  }
  expect(browserState).toContain(who.fullName);
  expect(browserState).not.toContain(verificationId);
  for (const url of requested) {
    expect(decodeURIComponent(url)).not.toContain(who.email);
    expect(url).not.toContain(who.phone.slice(1));
  }
  expect(await page.context().cookies()).toEqual([]);
  const session = await page.evaluate(() =>
    sessionStorage.getItem("rivana.analytics.session"),
  );
  const events = () =>
    sql('SELECT * FROM "SiteEvent" WHERE "sessionId" = $1 ORDER BY id', [
      session,
    ]);
  await expect
    .poll(async () => (await events()).rows.map((row) => row.name).sort())
    .toEqual(["CODE_REQUESTED", "PHONE_VERIFIED"]);
  const stored = JSON.stringify((await events()).rows);
  for (const secret of [
    token,
    code,
    verificationId,
    who.phone,
    who.email,
    who.fullName,
  ]) {
    expect(stored).not.toContain(secret);
  }

  // A reload keeps what was typed and asks to verify again.
  await page.reload();
  await expect(page.getByLabel("Full name")).toHaveValue(who.fullName);
  await expect(page.getByLabel(/Special requests/)).toHaveValue(
    "A quiet room A late arrival",
  );
  await button(page, "Continue to verification").click();
  await expect(button(page, "Send code")).toBeVisible();
});

test("an expired code is refused, and resending waits at the server's limit", async ({
  page,
}, testInfo) => {
  const who = guest(testInfo, 2);
  await page.setViewportSize({ width: 320, height: 844 });
  await fillDetails(page, who);
  const first = await requestCode(page);
  await setKnownCode(first, code);
  await sql(
    `UPDATE "PhoneVerification"
     SET "createdAt" = "createdAt" - interval '16 minutes',
         "expiresAt" = "expiresAt" - interval '16 minutes'
     WHERE id = $1`,
    [first],
  );
  await enterCode(page, code);
  await expect(
    page.getByText("That code can no longer be used. Send a new code."),
  ).toBeVisible();
  await verifyAccessibility(page);
  await capture(page, testInfo, "verify-code-expired");

  // The expired code left the 15 minute window, so three more may be sent.
  await requestCode(page);
  await requestCode(page, "Send again");
  const last = await requestCode(page, "Send again");
  const again = button(page, "Send again");
  await expect(again).toHaveAttribute("aria-disabled", "true");
  await expect(again).toHaveAccessibleDescription(
    /You can send another code in \d+ minutes\./,
  );
  await verifyAccessibility(page);
  await capture(page, testInfo, "verify-resend-wait");

  // The newest code still works.
  await setKnownCode(last, code);
  await enterCode(page, code);
  await expect(heading(page, "Phone verified")).toBeVisible();
});

test("AC-14: an email code verifies the email and says payment is online", async ({
  page,
}, testInfo) => {
  const who = guest(testInfo, 3);
  await page.setViewportSize({ width: 320, height: 844 });
  await fillDetails(page, who);
  await page.getByRole("radio", { name: /Email to/ }).check();
  await expect(page.getByText(/you pay online/)).toBeVisible();
  await verifyAccessibility(page);
  await capture(page, testInfo, "verify-email-choice");
  const id = await requestCode(page);
  await setKnownCode(id, code);
  await enterCode(page, code);
  await expect(heading(page, "Email verified")).toBeVisible();
  await expect(
    page.getByText(/confirm your phone number when you arrive/),
  ).toBeVisible();
  await verifyAccessibility(page);
  await capture(page, testInfo, "verify-email-verified");
  expect(
    (
      await sql(
        'SELECT channel, email FROM "PhoneVerification" WHERE id = $1',
        [id],
      )
    ).rows,
  ).toEqual([{ channel: "EMAIL", email: who.email }]);

  // A new email address needs a new code.
  await button(page, "Edit your details").click();
  await page.getByLabel("Email").fill(`new.${who.email}`);
  await button(page, "Continue to verification").click();
  await expect(button(page, "Send code")).toBeVisible();
});

test("a blocked number gets the neutral message and loses its draft", async ({
  page,
}, testInfo) => {
  const who = guest(testInfo, 4);
  await sql(
    `INSERT INTO "Guest" (id, phone, name, "blockedAt", "blockedById", "blockReason", "updatedAt")
     SELECT $1, $2, 'Blocked Guest', now(), id, 'Fictional', now()
     FROM "User" WHERE role = 'ADMIN' LIMIT 1`,
    [`e2e-blocked-${testInfo.project.name}`.slice(0, 32), who.phone],
  );
  await page.setViewportSize({ width: 320, height: 844 });
  await fillDetails(page, who);
  await button(page, "Send code").click();
  await expect(heading(page, "Contact the hotel")).toBeFocused();
  await expect(
    page.getByText("Please contact the hotel to continue."),
  ).toBeVisible();
  await expect(page.getByLabel("Verification code")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("rivana.booking.draft.new-cairo"),
    ),
  ).toBeNull();
  await verifyAccessibility(page);
  await capture(page, testInfo, "verify-blocked");
});
