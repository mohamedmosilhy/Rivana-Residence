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
  const local = `555-${String(100 + number).padStart(4, "0")}`;
  return {
    fullName: "Amina Hassan",
    email: `amina.${number}@example.test`,
    typed: `(202) ${local}`,
    phone: `+1202${local.replace("-", "")}`,
  };
}
type Guest = ReturnType<typeof guest>;

function detailsPage(days = 20, units = "deluxe-double.2.0") {
  const from = localDateAt(new Date(), "Africa/Cairo");
  const query = new URLSearchParams({
    checkIn: from.addDays(days).value,
    checkOut: from.addDays(days + 2).value,
    u: units,
  });
  return `/new-cairo/book/details?${query}`;
}

const heading = (page: Page, name: string) =>
  page.getByRole("heading", { name });
const button = (page: Page, name: string) => page.getByRole("button", { name });

async function fillDetails(
  page: Page,
  who: Guest,
  href: string | null = detailsPage(),
) {
  if (href) await page.goto(href);
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
  const directory = state.startsWith("checkout-")
    ? process.env.BOOKING_CHECKOUT_SCREENSHOTS
    : process.env.BOOKING_JOURNEY_SCREENSHOTS;
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
    // A photo still decoding would leave an empty frame in the picture.
    await Promise.all(
      Array.from(document.images, (image) => {
        image.loading = "eager";
        return image.decode().catch(() => undefined);
      }),
    );
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
  await expect(button(page, "Continue to extras")).toBeVisible();
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

const dollars = (amount: { amountMinor: number }) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    amount.amountMinor / 100,
  );

/** Runs `change` and returns what the server answered the price check with. */
async function priced(page: Page, change: () => Promise<unknown>) {
  const answer = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/quotes"),
  );
  await change();
  const response = await answer;
  return {
    status: response.status(),
    sent: response.request().postData()!,
    body: (await response.json()) as {
      quote: {
        total: { amountMinor: number };
        services: { kind: string; vehicles: number | null }[];
      };
    },
  };
}

const total = (page: Page) =>
  page.getByRole("status").filter({ hasText: "Total with VAT" });
const box = (page: Page, name: RegExp) => page.getByRole("checkbox", { name });
const couponField = (page: Page) => page.getByLabel("Coupon code (optional)");

async function verifyByWhatsApp(page: Page, who: Guest) {
  await fillDetails(page, who);
  await setKnownCode(await requestCode(page), code);
  await enterCode(page, code);
  await expect(heading(page, "Phone verified")).toBeVisible();
}

test("AC-3, AC-4: the server prices extras, cars and a coupon, by keyboard", async ({
  page,
}, testInfo) => {
  const who = guest(testInfo, 5);
  const checks: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/v1/quotes"))
      checks.push(request.postData() ?? "");
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await verifyByWhatsApp(page, who);
  await button(page, "Continue to extras").press("Enter");

  await expect(heading(page, "Extras and coupon")).toBeFocused();
  // Q-102: the stay panel gives the hotel's hours beside each date.
  const stayPanel = page.getByRole("complementary", { name: "Your stay" });
  await expect(stayPanel).toContainText("Check-in");
  await expect(stayPanel).toContainText("2:00 PM – 11:30 PM");
  await expect(stayPanel).toContainText("12:00 AM – 11:30 AM");
  await expect(box(page, /Breakfast/)).not.toBeChecked();
  await expect(box(page, /Airport transfer/)).not.toBeChecked();
  await expect(total(page)).toBeVisible();
  expect(checks).toEqual([]);
  await verifyAccessibility(page);
  await capture(page, testInfo, "extras-nothing-selected");
  const bare = await total(page).innerText();

  await priced(page, () => box(page, /Breakfast/).press("Space"));
  await priced(page, () => box(page, /Airport transfer/).press("Space"));
  await expect(page.getByLabel("Cars")).toHaveAccessibleDescription(
    "1 car takes up to 2 people.",
  );
  await expect(total(page)).toBeVisible();
  await capture(page, testInfo, "extras-one-car");
  const two = await priced(page, () =>
    page.getByLabel("Cars").selectOption("2"),
  );
  await expect(page.getByLabel("Cars")).toHaveAccessibleDescription(
    "2 cars take up to 4 people.",
  );
  expect(two.body.quote.services).toMatchObject([
    { kind: "BREAKFAST" },
    { kind: "AIRPORT_TRANSFER", vehicles: 2 },
  ]);
  await page.getByLabel(/Flight number/).fill("MS 985, arriving 14:30");
  await expect(total(page)).toContainText(dollars(two.body.quote.total));
  await verifyAccessibility(page);
  await capture(page, testInfo, "extras-selected");

  await couponField(page).fill("welcome10");
  const discounted = await priced(page, () => couponField(page).press("Enter"));
  await expect(page.getByText("Code WELCOME10 applied")).toBeVisible();
  expect(discounted.body.quote.total.amountMinor).toBeLessThan(
    two.body.quote.total.amountMinor,
  );
  await expect(total(page)).toContainText(dollars(discounted.body.quote.total));
  await expect(
    page.getByRole("complementary", { name: "Your stay" }),
  ).toContainText(`Total${dollars(discounted.body.quote.total)}`);
  await verifyAccessibility(page);
  await capture(page, testInfo, "coupon-applied");

  await couponField(page).fill("NOPE123");
  const refused = await priced(page, () => button(page, "Apply").click());
  expect(refused.status).toBe(422);
  await expect(couponField(page)).toHaveAccessibleDescription(
    "We don’t recognise this code. Check the spelling.",
  );
  await expect(page.getByText("Code WELCOME10 applied")).toBeVisible();
  await expect(total(page)).toContainText(dollars(discounted.body.quote.total));
  await verifyAccessibility(page);
  await capture(page, testInfo, "coupon-refused");

  await button(page, "Continue to payment").press("Enter");
  await expect(couponField(page)).toHaveAccessibleDescription(
    "Apply the code or clear it.",
  );
  await couponField(page).fill("");

  // AC-13: the flight text and the code stay in the page's memory.
  const browserState = await page.evaluate(() =>
    JSON.stringify([
      { ...sessionStorage },
      { ...localStorage },
      document.cookie,
      location.href,
    ]),
  );
  expect(browserState).not.toContain("MS 985");
  expect(browserState).not.toContain("WELCOME10");
  expect(checks.join()).not.toContain("MS 985");

  await button(page, "Continue to payment").press("Enter");
  await expect(heading(page, "Choose how to pay")).toBeFocused();
  await verifyAccessibility(page);
  await button(page, "Back to extras").press("Enter");
  await expect(box(page, /Breakfast/)).toBeChecked();
  await expect(page.getByLabel(/Flight number/)).toHaveValue(
    "MS 985, arriving 14:30",
  );

  await priced(page, () => button(page, "Remove coupon WELCOME10").click());
  await priced(page, () => box(page, /Breakfast/).uncheck());
  const none = await priced(page, () =>
    box(page, /Airport transfer/).uncheck(),
  );
  expect(none.body.quote.services).toEqual([]);
  await expect(total(page)).toContainText(dollars(none.body.quote.total));
  expect(await total(page).innerText()).toBe(bare);
});

test("price checks that fail keep the choices and say what to do", async ({
  page,
}, testInfo) => {
  const who = guest(testInfo, 6);
  await page.setViewportSize({ width: 320, height: 844 });
  await verifyByWhatsApp(page, who);
  await button(page, "Continue to extras").click();
  await expect(total(page)).toBeVisible();

  // The failures are answered in the browser; the database stays untouched.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/v1/quotes", async (route) => {
    await held;
    await route.continue();
  });
  await box(page, /Breakfast/).check();
  await expect(page.getByText("Updating price…").first()).toBeVisible();
  await expect(button(page, "Continue to payment")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await capture(page, testInfo, "price-updating");
  release();
  await expect(total(page)).toBeVisible();
  await page.unroute("**/api/v1/quotes");

  const refuse = async (
    state: string,
    status: number,
    problem: object,
    change: () => Promise<unknown>,
    words: string,
    headers: Record<string, string> = {},
  ) => {
    // Once: a check the page sends next reaches the real server.
    await page.route(
      "**/api/v1/quotes",
      (route) =>
        route.fulfill({
          status,
          contentType: "application/problem+json",
          headers,
          body: JSON.stringify({ title: "Refused", ...problem }),
        }),
      { times: 1 },
    );
    await change();
    await expect(page.getByText(words)).toBeVisible();
    await verifyAccessibility(page);
    await capture(page, testInfo, state);
  };

  await refuse(
    "price-connection-failed",
    500,
    { code: "INTERNAL" },
    () => box(page, /Airport transfer/).check(),
    "We couldn’t check the price. Please try again.",
  );
  await button(page, "Check again").click();
  await expect(total(page)).toBeVisible();

  await couponField(page).fill("welcome10");
  await button(page, "Apply").click();
  await expect(page.getByText("Code WELCOME10 applied")).toBeVisible();
  await refuse(
    "price-too-many-checks",
    429,
    { code: "RATE_LIMITED" },
    () => page.getByLabel("Cars").selectOption("3"),
    "Too many price checks. Try again in 10 minutes.",
    { "Retry-After": "600" },
  );
  await page
    .getByRole("button", { name: "Remove coupon", exact: true })
    .click();
  await expect(total(page)).toBeVisible();

  await refuse(
    "service-removed",
    409,
    { code: "SERVICE_UNAVAILABLE", context: { kind: "AIRPORT_TRANSFER" } },
    () => page.getByLabel("Cars").selectOption("2"),
    "Airport transfer is no longer available, so we removed it.",
  );
  await expect(total(page)).toBeVisible();
  await expect(box(page, /Airport transfer/)).toHaveCount(0);

  await page.route("**/api/v1/quotes", (route) =>
    route.fulfill({
      json: {
        available: false,
        unavailableLines: [0],
        bookable: false,
        paymentMethods: [],
        quote: null,
      },
    }),
  );
  await box(page, /Breakfast/).uncheck();
  await expect(
    page.getByRole("alert").getByText("Your selection is no longer available."),
  ).toBeVisible();
  await verifyAccessibility(page);
  await capture(page, testInfo, "selection-unavailable");
  await expect(
    page.getByRole("link", { name: "Back to the results" }),
  ).toHaveAttribute("href", /notice=unavailable/);
});

test("AC-14: an email guest cannot continue with a total of zero", async ({
  page,
}, testInfo) => {
  const who = guest(testInfo, 7);
  await page.setViewportSize({ width: 320, height: 844 });
  await fillDetails(page, who);
  await page.getByRole("radio", { name: /Email to/ }).check();
  await setKnownCode(await requestCode(page), code);
  await enterCode(page, code);
  await expect(heading(page, "Email verified")).toBeVisible();
  await button(page, "Continue to extras").click();
  await couponField(page).fill("wholestay");
  await button(page, "Apply").click();
  await expect(total(page)).toContainText("$0.00");
  await expect(
    page.getByText(/this total cannot be paid online/),
  ).toBeVisible();
  await expect(button(page, "Continue to payment")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await verifyAccessibility(page);
  await capture(page, testInfo, "email-total-not-payable");
});

/** Distinct dates, contact and client address for each real write. */
async function checkoutGuest(
  page: Page,
  info: TestInfo,
  scenario: number,
  href: string | null,
  email = false,
) {
  const who = guest(info, scenario);
  await page.setExtraHTTPHeaders({
    "X-Forwarded-For": `198.51.100.${scenario * 10 + projects.indexOf(info.project.name)}`,
  });
  await fillDetails(page, who, href);
  if (email) await page.getByRole("radio", { name: /Email to/ }).check();
  await setKnownCode(await requestCode(page), code);
  await enterCode(page, code);
  await button(page, "Continue to extras").click();
  return who;
}
const submitButton = (page: Page) => button(page, "Confirm booking");
/**
 * Answers booking submissions in the order queued, through one route held for
 * the whole test: replacing one-use routes between clicks can let a request
 * through in WebKit. An unplanned submission is cut off, never booked.
 */
async function scriptBookingAnswers(page: Page) {
  const queued: { status: number; json: object }[] = [];
  const keys: (string | undefined)[] = [];
  await page.route("**/api/v1/reservations", (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    const next = queued.shift();
    return next ? route.fulfill(next) : route.abort("failed");
  });
  return {
    keys,
    answer: (status: number, json: object) => queued.push({ status, json }),
  };
}
const onBooking = (page: Page) =>
  page.waitForResponse((r) => r.url().endsWith("/api/v1/reservations"));
const records = (who: Guest) =>
  sql(
    'SELECT reference,status,"totalMinor" FROM "Reservation" WHERE "guestPhone"=$1',
    [who.phone],
  );
async function review(page: Page, email = false) {
  await button(page, "Continue to payment").click();
  if (!email)
    await page.getByRole("radio", { name: /Pay at the hotel/ }).check();
  await button(page, "Continue to review").click();
  await expect(heading(page, "Review your booking")).toBeVisible();
  await box(page, /I accept the privacy/).check();
}

test("checkout: two units with extras, coupon and VAT are confirmed once", async ({
  page,
}, info) => {
  const days = 35 + projects.indexOf(info.project.name) * 3;
  const dates = new URL(detailsPage(days), "http://localhost").searchParams;
  dates.delete("u");
  dates.set("adults", "2");
  dates.set("children", "0");
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(`/new-cairo/book?${dates}`);
  await button(page, "Add to stay: Deluxe Double").click();
  await button(page, "Add to stay: Studio with Balcony").click();
  await page.getByRole("link", { name: /^Continue/ }).click();
  const who = await checkoutGuest(page, info, 8, null);
  await priced(page, () => box(page, /Airport transfer/).check());
  await priced(page, () => page.getByLabel("Cars").selectOption("2"));
  await page.getByLabel(/Flight number/).fill("Demo flight 120");
  await couponField(page).fill("WELCOME10");
  await priced(page, () => button(page, "Apply").click());
  await button(page, "Continue to payment").click();
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
  await verifyAccessibility(page);
  await capture(page, info, "checkout-payment");
  await page.getByRole("radio", { name: /Pay at the hotel/ }).press("Space");
  await button(page, "Continue to review").press("Enter");
  await expect(submitButton(page)).toBeDisabled();
  await expect(box(page, /marketing consent/i)).not.toBeChecked();
  await page.getByRole("button", { name: /Add breakfast/ }).click();
  await expect(box(page, /Breakfast/)).toBeChecked();
  await review(page);
  await verifyAccessibility(page);
  await capture(page, info, "checkout-review");
  const summary = page.getByRole("complementary", { name: "Your stay" });
  await expect(summary).toContainText("Studio with Balcony");
  const created = onBooking(page);
  await submitButton(page).evaluate((el: HTMLButtonElement) => {
    el.click();
    el.click();
  });
  const response = await created;
  expect(response.status()).toBe(201);
  const [data] = (await records(who)).rows;
  const body = response.request().postDataJSON();
  expect(body.expectedTotal.amountMinor).toBe(data.totalMinor);
  expect(body.services).toContainEqual({
    kind: "AIRPORT_TRANSFER",
    vehicles: 2,
    details: "Demo flight 120",
  });
  await expect(heading(page, "Confirmed")).toBeVisible();
  await expect(page.getByText(data.reference)).toBeVisible();
  expect((await records(who)).rows).toEqual([
    {
      reference: data.reference,
      status: "CONFIRMED",
      totalMinor: body.expectedTotal.amountMinor,
    },
  ]);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("rivana.booking.draft.new-cairo"),
    ),
  ).toBeNull();
  await verifyAccessibility(page);
  await capture(page, info, "checkout-confirmed");
});

test("checkout: email verification hands a pending booking to hosted checkout", async ({
  page,
}, info) => {
  const days = 55 + projects.indexOf(info.project.name) * 3;
  const who = await checkoutGuest(page, info, 9, detailsPage(days), true);
  await button(page, "Continue to payment").click();
  await expect(page.getByRole("radio")).toHaveCount(1);
  await expect(
    page.getByRole("radio", { name: /Pay online now/ }),
  ).toBeChecked();
  await capture(page, info, "checkout-email-payment");
  await button(page, "Continue to review").click();
  await expect(box(page, /marketing consent/i)).toHaveCount(0);
  await box(page, /I accept the privacy/).check();
  await capture(page, info, "checkout-email-review");
  await button(page, "Continue to secure checkout").click();
  await expect(page).toHaveURL(/\/dev\/fake-checkout\//);
  expect((await records(who)).rows[0].status).toBe("AWAITING_PAYMENT");
});

test("checkout: a lost response retries exactly the same saved booking", async ({
  page,
}, info) => {
  const days = 75 + projects.indexOf(info.project.name) * 3;
  const who = await checkoutGuest(page, info, 10, detailsPage(days));
  await review(page);
  let key: string | undefined;
  await page.route(
    "**/api/v1/reservations",
    async (route) => {
      key = route.request().headers()["idempotency-key"];
      expect((await route.fetch()).status()).toBe(201);
      await route.abort("failed");
    },
    { times: 1 },
  );
  await submitButton(page).click();
  await expect(button(page, "Retry same booking")).toBeVisible();
  await capture(page, info, "checkout-retry");
  // Leaving now would lose the request key, so the browser asks first.
  const prompt = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const dialog = await prompt;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  const replay = onBooking(page);
  await button(page, "Retry same booking").click();
  const response = await replay;
  expect(response.status()).toBe(200);
  expect(response.request().headers()["idempotency-key"]).toBe(key);
  expect((await response.json()).manageUrl).toBeNull();
  await expect(heading(page, "Your booking reference")).toBeVisible();
  expect((await records(who)).rows).toHaveLength(1);
  await capture(page, info, "checkout-reference");
});

test("checkout: the second browser books the last units before the first submits", async ({
  page,
  browser,
}, info) => {
  const days = 95 + projects.indexOf(info.project.name) * 3;
  const who = await checkoutGuest(page, info, 11, detailsPage(days));
  await review(page);
  const other = await browser.newContext({
    baseURL: info.project.use.baseURL!,
  });
  try {
    const winner = await other.newPage();
    await checkoutGuest(
      winner,
      info,
      12,
      detailsPage(days, "deluxe-double.2.0,deluxe-double.2.0"),
    );
    await review(winner);
    await submitButton(winner).click();
    await expect(heading(winner, "Confirmed")).toBeVisible();
    const answer = onBooking(page);
    await submitButton(page).click();
    expect((await answer).status()).toBe(409);
    await expect(page).toHaveURL(/notice=unavailable/);
    expect((await records(who)).rowCount).toBe(0);
    await capture(page, info, "checkout-sold-out");
  } finally {
    await other.close();
  }
});

test("checkout: a changed nightly rate requires explicit acceptance", async ({
  page,
}, info) => {
  const days = 115 + projects.indexOf(info.project.name) * 3;
  const href = detailsPage(days);
  const who = await checkoutGuest(page, info, 13, href);
  await review(page);
  const params = new URL(href, "http://localhost").searchParams;
  await sql(
    `INSERT INTO "RatePeriod"(id,"roomTypeId","startDate","endDate","amountMinor","updatedAt") SELECT $1,id,$2::date,$3::date,9900,now() FROM "Room" WHERE slug='deluxe-double'`,
    [`t6-${info.project.name}`, params.get("checkIn"), params.get("checkOut")],
  );
  const refused = onBooking(page);
  await submitButton(page).click();
  const first = await refused;
  expect((await first.json()).code).toBe("PRICE_CHANGED");
  await expect(button(page, "Accept new total")).toBeVisible();
  await expect(submitButton(page)).toHaveCount(0);
  await capture(page, info, "checkout-price-changed");
  expect((await records(who)).rowCount).toBe(0);
  await button(page, "Accept new total").click();
  const saved = onBooking(page);
  await submitButton(page).click();
  const last = await saved;
  expect(last.request().headers()["idempotency-key"]).not.toBe(
    first.request().headers()["idempotency-key"],
  );
  await expect(heading(page, "Confirmed")).toBeVisible();
  expect((await records(who)).rows[0].totalMinor).toBe(
    last.request().postDataJSON().expectedTotal.amountMinor,
  );
});

test("checkout: recovery when the booking link is missing, expired or cannot be checked", async ({
  page,
}, info) => {
  await page.goto("/new-cairo/book/confirmed");
  await expect(heading(page, "Open your booking message")).toBeVisible();
  await verifyAccessibility(page);
  await capture(page, info, "checkout-missing-link");
  await page.evaluate(() =>
    sessionStorage.setItem(
      "rivana.booking.result",
      JSON.stringify({
        reference: "DEMO",
        branchSlug: "new-cairo",
        status: "CONFIRMED",
        token: "x".repeat(43),
      }),
    ),
  );
  await page.route("**/api/v1/guest/reservation", (r) => r.abort());
  await page.reload();
  await expect(button(page, "Check again")).toBeVisible();
  await capture(page, info, "checkout-read-failed");
  await page.unroute("**/api/v1/guest/reservation");
  await button(page, "Check again").click();
  await expect(heading(page, "Open your booking message")).toBeVisible();
});

test("checkout: a changed method, a temporary refusal and a closed branch give recovery steps", async ({
  page,
}, info) => {
  await checkoutGuest(page, info, 14, detailsPage(12));
  await review(page);
  const booking = await scriptBookingAnswers(page);
  const fail = (code: string, status: number) =>
    booking.answer(status, { code, title: "Booking refused" });
  fail("PAYMENT_METHOD_UNAVAILABLE", 409);
  await submitButton(page).click();
  await expect(heading(page, "Choose how to pay")).toBeVisible();
  await capture(page, info, "checkout-method-changed");
  await page.getByRole("radio", { name: /Pay at the hotel/ }).check();
  await button(page, "Continue to review").click();
  fail("RATE_LIMITED", 429);
  await submitButton(page).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Too many attempts" }),
  ).toBeVisible();
  await capture(page, info, "checkout-rate-limited");
  fail("BRANCH_NOT_BOOKABLE", 409);
  await submitButton(page).click();
  await expect(heading(page, "Contact the hotel")).toBeVisible();
  await verifyAccessibility(page);
  await capture(page, info, "checkout-closed");
});

test("checkout: checkout that cannot open is retried, then reported as failed", async ({
  page,
}, info) => {
  await checkoutGuest(page, info, 15, detailsPage(13));
  await review(page);
  const { answer, keys } = await scriptBookingAnswers(page);
  answer(503, { code: "PAYMENT_UNAVAILABLE", title: "Unavailable" });
  await submitButton(page).click();
  await expect(button(page, "Retry same booking")).toBeVisible();
  await verifyAccessibility(page);
  await capture(page, info, "checkout-unavailable");
  answer(200, {
    reference: "RR-DEMO1234",
    status: "PAYMENT_FAILED",
    manageUrl: null,
  });
  await button(page, "Retry same booking").click();
  await expect(page.getByText(/units are no longer held/)).toBeVisible();
  expect(keys[1]).toBe(keys[0]);
  await verifyAccessibility(page);
  await capture(page, info, "checkout-payment-failed");
});
