import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

import { GUEST_CONSENT_VERSIONS } from "../../src/domain/guests/consent-policy";
import { localDateAt } from "../../src/domain/shared/zoned-time";

import {
  screenshot,
  setKnownCode,
  verifyAccessibility,
} from "./support/booking";
import { sql } from "./support/session";

// M10-T8: the manage page and "My reservations" with cancellation requests
// (E2E-G-6 and the rest of E2E-G-5). The journeys need providers, so they run
// on the development server with BOOKING_JOURNEY_E2E=1. The pages without a
// booking also run in the standard browser suite.
const journey = process.env.BOOKING_JOURNEY_E2E === "1";
test.describe.configure({ timeout: 120_000 });

const code = "482913";
const projects = [
  "desktop-chromium",
  "mobile-chromium",
  "webkit-desktop",
  "webkit-tablet",
  "webkit-phone",
];
const projectIndex = (info: TestInfo) =>
  Math.max(projects.indexOf(info.project.name), 0);
const capture = (page: Page, info: TestInfo, state: string) =>
  screenshot(page, info, process.env.BOOKING_GUEST_SCREENSHOTS, state);

const heading = (page: Page, name: string) =>
  page.getByRole("heading", { name, exact: true });
const button = (page: Page, name: string | RegExp) =>
  page.getByRole("button", { name });
const noMatch = (text: string, secrets: readonly string[]) => {
  for (const secret of secrets) expect(text).not.toContain(secret);
};

test.describe("pages without a booking", () => {
  test("a missing or broken link says the same thing and shows how to go on", async ({
    page,
  }, info) => {
    const calls: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/guest/")) calls.push(request.url());
    });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/reservations/manage#t=not-a-key");
    await expect(heading(page, "Open your booking link")).toBeVisible();
    await expect(page).toHaveURL(/\/reservations\/manage$/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    await verifyAccessibility(page);
    await capture(page, info, "manage-unusable-link");
    expect(calls).toEqual([]);

    await page
      .getByRole("link", { name: /Find it in My reservations/ })
      .click();
    await expect(page).toHaveURL(/\/reservations\/find$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "My reservations" }),
    ).toBeVisible();
  });

  test("My reservations says so when no code can be sent", async ({
    page,
  }, info) => {
    // The production server of the standard run has no provider.
    test.skip(journey, "The journey run has providers for both channels.");
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/reservations/find");
    await expect(heading(page, "Codes can’t be sent right now")).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("link", { name: "Contact the hotel" }),
    ).not.toHaveCount(0);
    await verifyAccessibility(page);
    await capture(page, info, "find-codes-unavailable");
  });

  test("every public page's footer leads to My reservations", async ({
    page,
  }) => {
    await page.goto("/new-cairo/contact");
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "My reservations" })
      .click();
    await expect(page).toHaveURL(/\/reservations\/find$/);
  });

  test("without JavaScript both pages show the hotel's contacts", async ({
    browser,
    baseURL,
  }, info) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      baseURL: baseURL!,
      viewport: info.project.use.viewport ?? { width: 390, height: 844 },
    });
    const page = await context.newPage();
    for (const [path, state, words] of [
      ["/reservations/manage", "manage-no-javascript", "open your booking"],
      ["/reservations/find", "find-no-javascript", "see your bookings"],
    ] as const) {
      await page.goto(path);
      await expect(
        page.getByText(new RegExp(`Enable JavaScript to ${words}`)),
      ).toBeVisible();
      await expect(
        page.getByRole("main").getByRole("link", { name: "Contact the hotel" }),
      ).not.toHaveCount(0);
      await capture(page, info, state);
    }
    await context.close();
  });
});

type Guest = Readonly<{ fullName: string; email: string; phone: string }>;

/** A fictional guest of its own for each project and test. */
function guest(info: TestInfo, scenario: number) {
  const number = scenario * 10 + projectIndex(info);
  const local = `555-${String(100 + number).padStart(4, "0")}`;
  return {
    fullName: "Amina Hassan",
    email: `amina.${number}@example.test`,
    typed: `(202) ${local}`,
    phone: `+1202${local.replace("-", "")}`,
  };
}

/** A separate client for each project and test, for the public limits. */
const client = (info: TestInfo, scenario: number) => ({
  "X-Forwarded-For": `203.0.113.${scenario * 5 + projectIndex(info)}`,
});

/** Books one unit through the public API, as the booking journey would. */
async function book(
  request: APIRequestContext,
  headers: Record<string, string>,
  who: Guest,
  daysAhead: number,
  roomSlug = "studio-with-balcony",
  {
    nights = 2,
    online = false,
  }: Readonly<{ nights?: number; online?: boolean }> = {},
) {
  const sent = await request.post("/api/v1/phone-verifications", {
    headers,
    data: { phone: who.phone, purpose: "BOOKING" },
  });
  expect(sent.status()).toBe(201);
  const { verificationId } = await sent.json();
  await setKnownCode(verificationId, code);
  const confirmed = await request.post(
    `/api/v1/phone-verifications/${verificationId}/confirmation`,
    { headers, data: { code } },
  );
  const { token } = await confirmed.json();
  const from = localDateAt(new Date(), "Africa/Cairo").addDays(daysAhead);
  const selection = {
    branchSlug: "new-cairo",
    stay: { checkIn: from.value, checkOut: from.addDays(nights).value },
    lines: [{ roomSlug, occupancy: { adults: 2, children: 0 } }],
    services: [],
  };
  const priced = await request.post("/api/v1/quotes", {
    headers,
    data: selection,
  });
  const { quote } = await priced.json();
  const created = await request.post("/api/v1/reservations", {
    headers: { ...headers, "Idempotency-Key": randomUUID() },
    data: {
      ...selection,
      guest: {
        fullName: who.fullName,
        email: who.email,
        phone: who.phone,
        country: "US",
        specialRequests: "A quiet room",
      },
      phoneVerificationToken: token,
      paymentMethod: online ? "ONLINE" : "PAY_AT_HOTEL",
      expectedTotal: quote.total,
      consent: {
        privacyNoticeVersion: GUEST_CONSENT_VERSIONS.privacyNotice,
      },
    },
  });
  expect(created.status()).toBe(201);
  const { reference, manageUrl, checkoutUrl } = await created.json();
  return {
    checkoutUrl: checkoutUrl as string | undefined,
    /** The date `offset` nights after check-in. */
    day: (offset: number) => from.addDays(offset).value,
    reference: reference as string,
    manageUrl: manageUrl as string,
    key: (manageUrl as string).split("#t=")[1]!,
  };
}

const requestsOf = (reference: string) =>
  sql(
    'SELECT c.status, c."guestReason" FROM "CancellationRequest" c JOIN "Reservation" r ON r.id = c."reservationId" WHERE r.reference = $1',
    [reference],
  );

/** AC-13: nothing secret in storage beyond the named key, or in website events. */
async function expectNoSecretsStored(page: Page, secrets: readonly string[]) {
  expect(await page.context().cookies()).toEqual([]);
  const events = await sql('SELECT * FROM "SiteEvent"');
  noMatch(JSON.stringify(events.rows), secrets);
}

test.describe("with a booking", () => {
  test.skip(!journey, "Run the focused BOOKING_JOURNEY_E2E=1 journey suite.");

  test("E2E-G-6: the private link opens the booking, a request is sent, and contacts replace the button after the deadline", async ({
    page,
    request,
    browserName,
  }, info) => {
    const who = guest(info, 20);
    const headers = client(info, 1);
    const later = await book(
      request,
      headers,
      who,
      70 + projectIndex(info) * 3,
    );
    // Tonight's arrival is already inside the 24 hours. Two room types share
    // the five projects, so neither runs out of units.
    const tonight = await book(
      request,
      headers,
      who,
      0,
      projectIndex(info) < 4 ? "studio-with-balcony" : "deluxe-double",
    );
    await page.setExtraHTTPHeaders(headers);
    const addresses: string[] = [];
    const logged: string[] = [];
    page.on("request", (sent) => addresses.push(sent.url()));
    page.on("console", (message) => logged.push(message.text()));
    const keys = [later.key, tonight.key];

    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(later.manageUrl);
    await expect(heading(page, "Confirmed")).toBeVisible();
    await expect(page).toHaveURL(/\/reservations\/manage$/);
    await expect(page.getByText(later.reference)).toBeVisible();
    await expect(page.getByText("A quiet room")).toBeVisible();
    await expect(
      page.getByText(/change this booking or ask to cancel online until/),
    ).toBeVisible();
    await verifyAccessibility(page);
    await capture(page, info, "manage-confirmed");

    // A reload and a visit to another page and back keep the booking and never
    // put the key back in the address.
    await page.reload();
    await expect(heading(page, "Confirmed")).toBeVisible();
    await page.getByRole("link", { name: "Contact the hotel" }).click();
    await expect(page).toHaveURL(/\/new-cairo\/contact$/);
    await page.goBack();
    await expect(heading(page, "Confirmed")).toBeVisible();
    await expect(page).toHaveURL(/\/reservations\/manage$/);

    await button(page, "Request cancellation").press("Enter");
    const reason = page.getByLabel(/Reason/);
    await expect(reason).toBeFocused();
    await verifyAccessibility(page);
    await capture(page, info, "manage-cancel-form");
    await reason.focus();
    await page.keyboard.type("Our plans changed");
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    await expect(button(page, "Send request")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText("Your request was sent to the hotel."),
    ).toBeFocused();
    await expect(heading(page, "Cancellation requested")).toBeVisible();
    await expect(button(page, "Request cancellation")).toHaveCount(0);
    await verifyAccessibility(page);
    await capture(page, info, "manage-request-open");
    expect((await requestsOf(later.reference)).rows).toEqual([
      { status: "OPEN", guestReason: "Our plans changed" },
    ]);

    // Another link pasted into the same tab.
    await page.goto(tonight.manageUrl);
    await expect(page.getByText(tonight.reference)).toBeVisible();
    await expect(page).toHaveURL(/\/reservations\/manage$/);
    await expect(
      page.getByText(/Online changes and cancellation closed on/),
    ).toBeVisible();
    await expect(button(page, "Request cancellation")).toHaveCount(0);
    await expect(button(page, "Change booking")).toHaveCount(0);
    await expect(
      page.getByRole("main").getByRole("link", { name: /\+1 202 555 0198/ }),
    ).toBeVisible();
    await verifyAccessibility(page);
    await capture(page, info, "manage-deadline-passed");
    await screenshot(
      page,
      info,
      process.env.BOOKING_CHANGE_SCREENSHOTS,
      "change-deadline-passed",
    );

    const outside = await page.evaluate(() =>
      JSON.stringify([
        location.href,
        document.cookie,
        { ...localStorage },
        document.documentElement.outerHTML,
      ]),
    );
    for (const text of [outside, addresses.join(), logged.join()])
      noMatch(text, keys);
    expect(
      await page.evaluate(() => sessionStorage.getItem("rivana.access.manage")),
    ).toBe(tonight.key);
    await expectNoSecretsStored(page, keys);
  });

  test("the manage page shows every request state and recovers from failed reads", async ({
    page,
    request,
  }, info) => {
    const who = guest(info, 21);
    const headers = client(info, 2);
    const made = await book(request, headers, who, 90 + projectIndex(info) * 3);
    await page.setExtraHTTPHeaders(headers);
    const current = await (
      await request.get("/api/v1/guest/reservation", {
        headers: { ...headers, Authorization: `Bearer ${made.key}` },
      })
    ).json();
    // The test supplies these answers; staff decisions arrive with M11.
    let answer: { status: number; json: object; headers?: object } | null =
      null;
    await page.route("**/api/v1/guest/reservation", (route) =>
      answer ? route.fulfill(answer as never) : route.continue(),
    );
    const stateful = (patch: object) => ({
      status: 200,
      json: { ...current, allowedActions: [], ...patch },
    });
    const decided = (status: string, decisionReason: string | null = null) => ({
      id: "request-1",
      status,
      createdAt: current.createdAt,
      decisionReason,
    });
    const change = {
      id: "change-1",
      status: "OPEN",
      createdAt: current.createdAt,
      previewTotalMinor: 31000,
      decisionReason: null,
      closedReason: null,
    };
    await page.setViewportSize({ width: 320, height: 844 });
    const states = [
      [
        "manage-request-rejected",
        stateful({
          allowedActions: ["REQUEST_CANCELLATION"],
          cancellationRequest: decided(
            "REJECTED",
            "The rate for these dates is not refundable.",
          ),
        }),
        "Cancellation request declined",
      ],
      [
        "manage-refund-pending",
        stateful({
          paymentMethod: "ONLINE",
          paymentStatus: "REFUND_PENDING",
          cancellationRequest: decided("REFUND_PENDING"),
        }),
        "Approved, refund requested",
      ],
      [
        "manage-refund-failed",
        stateful({
          paymentMethod: "ONLINE",
          paymentStatus: "PAID",
          cancellationRequest: decided("REFUND_FAILED"),
        }),
        "The refund has not gone through yet",
      ],
      [
        "manage-cancelled",
        stateful({
          status: "CANCELLED",
          paymentMethod: "ONLINE",
          paymentStatus: "REFUNDED",
          cancellationRequest: decided("COMPLETED"),
        }),
        "Cancellation completed",
      ],
      [
        "manage-change-open",
        stateful({ changeRequest: change }),
        "Change sent to the hotel",
      ],
    ] as const;
    answer = states[0][1];
    await page.goto(made.manageUrl);
    for (const [index, [state, next, title]] of states.entries()) {
      answer = next;
      if (index > 0) await page.reload();
      await expect(heading(page, title)).toBeVisible();
      await verifyAccessibility(page);
      await capture(page, info, state);
    }

    answer = {
      status: 429,
      headers: { "Retry-After": "120" },
      json: { code: "RATE_LIMITED", title: "Too many requests." },
    };
    await page.reload();
    await expect(heading(page, "We couldn’t load your booking")).toBeVisible();
    await expect(button(page, "Check again")).toBeDisabled();
    await verifyAccessibility(page);
    await capture(page, info, "manage-load-failed");

    // A lost reply to a cancellation request, then a booking that cannot be
    // read: no second try is offered until the booking is known.
    answer = null;
    await page.reload();
    await expect(heading(page, "Confirmed")).toBeVisible();
    await page.route("**/api/v1/guest/reservation/cancellation-requests", (r) =>
      r.abort("failed"),
    );
    await button(page, "Request cancellation").click();
    answer = {
      status: 503,
      json: { code: "TRY_AGAIN", title: "Busy." },
    };
    await button(page, "Send request").click();
    await expect(page.getByText(/may be out of date/)).toBeVisible();
    await expect(button(page, "Request cancellation")).toHaveCount(0);
    await verifyAccessibility(page);
    await capture(page, info, "manage-lost-reply");
    answer = null;
    await button(page, "Check again").click();
    await expect(button(page, "Request cancellation")).toBeVisible();
    expect((await requestsOf(made.reference)).rows).toEqual([]);
  });

  test("E2E-G-5: My reservations with a WhatsApp code, by keyboard", async ({
    page,
    request,
  }, info) => {
    const who = guest(info, 22);
    const headers = client(info, 3);
    const made = await book(
      request,
      headers,
      who,
      110 + projectIndex(info) * 3,
    );
    await page.setExtraHTTPHeaders(headers);
    const addresses: string[] = [];
    const logged: string[] = [];
    page.on("request", (sent) => addresses.push(sent.url()));
    page.on("console", (message) => logged.push(message.text()));

    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/reservations/find");
    await expect(heading(page, "Find your bookings")).toBeVisible();
    await verifyAccessibility(page);
    await capture(page, info, "find-form");
    await button(page, "Continue").press("Enter");
    await expect(
      page.getByLabel("Phone number", { exact: true }),
    ).toBeFocused();
    await expect(page.getByText("Enter your phone number.")).toBeVisible();
    await verifyAccessibility(page);
    await capture(page, info, "find-form-errors");
    await page.getByLabel("Phone country").selectOption("US");
    await page.getByLabel("Phone number", { exact: true }).fill(who.typed);
    await page.getByLabel("Phone number", { exact: true }).press("Enter");
    await expect(heading(page, "Verify your contact")).toBeVisible();
    await verifyAccessibility(page);
    await capture(page, info, "find-send-code");

    const sent = page.waitForResponse((response) =>
      response.url().endsWith("/api/v1/phone-verifications"),
    );
    await button(page, "Send code").press("Enter");
    const response = await sent;
    expect(response.request().postDataJSON()).toEqual({
      phone: who.phone,
      purpose: "GUEST_SESSION",
      channel: "WHATSAPP",
    });
    const { verificationId } = await response.json();
    await setKnownCode(verificationId, code);
    await expect(page.getByLabel("Verification code")).toBeFocused();
    await page.keyboard.type("000000");
    await page.keyboard.press("Enter");
    await expect(
      page.getByText("That code is not correct. 4 attempts left."),
    ).toBeVisible();
    await verifyAccessibility(page);
    await capture(page, info, "find-wrong-code");
    const confirmed = page.waitForResponse((r) =>
      r.url().endsWith("/confirmation"),
    );
    await page.getByLabel("Verification code").fill(code);
    await page.keyboard.press("Enter");
    const { token } = await (await confirmed).json();

    await expect(heading(page, "Your bookings")).toBeFocused();
    await expect(page.getByText(made.reference).first()).toBeVisible();
    await verifyAccessibility(page);
    await capture(page, info, "find-list");
    // The tab keeps the session through a reload.
    await page.reload();
    await button(page, `View booking ${made.reference}`).press("Enter");
    await expect(heading(page, "Confirmed")).toBeVisible();
    await verifyAccessibility(page);
    await capture(page, info, "find-booking");
    await button(page, "Request cancellation").press("Enter");
    await button(page, "Send request").press("Enter");
    await expect(heading(page, "Cancellation requested")).toBeVisible();
    await capture(page, info, "find-booking-request-open");
    expect((await requestsOf(made.reference)).rows).toEqual([
      { status: "OPEN", guestReason: null },
    ]);

    await button(page, "Back to my reservations").press("Enter");
    await expect(heading(page, "Your bookings")).toBeFocused();
    await button(page, "Sign out").press("Enter");
    await expect(heading(page, "Find your bookings")).toBeFocused();
    await expect(page.getByLabel("Phone number", { exact: true })).toHaveValue(
      "",
    );
    await verifyAccessibility(page);
    await capture(page, info, "find-signed-out");

    const outside = await page.evaluate(() =>
      JSON.stringify([
        location.href,
        document.cookie,
        { ...sessionStorage },
        { ...localStorage },
        document.documentElement.outerHTML,
      ]),
    );
    const secrets = [token, code, verificationId, made.key];
    // The analytics visit id may be stored; no key or code is.
    noMatch(outside, secrets);
    for (const text of [addresses.join(), logged.join()]) {
      noMatch(text, [token, made.key]);
      expect(text).not.toContain(who.phone.slice(1));
    }
    await expectNoSecretsStored(page, [token, made.key, who.phone, who.email]);
  });

  test("E2E-G-5: My reservations with an email code, an empty list and a blocked number", async ({
    page,
    request,
  }, info) => {
    const who = guest(info, 23);
    const headers = client(info, 4);
    const made = await book(
      request,
      headers,
      who,
      130 + projectIndex(info) * 3,
    );
    await page.setExtraHTTPHeaders(headers);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/reservations/find");

    async function ask(email: string) {
      await page.getByRole("radio", { name: /Email/ }).check();
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Phone country").selectOption("US");
      await page.getByLabel("Phone number", { exact: true }).fill(who.typed);
    }
    async function verify() {
      await button(page, "Continue").click();
      const sent = page.waitForResponse((response) =>
        response.url().endsWith("/api/v1/phone-verifications"),
      );
      await button(page, "Send code").click();
      const { verificationId } = await (await sent).json();
      await setKnownCode(verificationId, code);
      await page.getByLabel("Verification code").fill(code);
      await button(page, "Verify code").click();
      await expect(heading(page, "Your bookings")).toBeVisible();
    }

    await ask(who.email);
    await verifyAccessibility(page);
    await capture(page, info, "find-email-form");
    await verify();
    await expect(button(page, `View booking ${made.reference}`)).toBeVisible();

    await button(page, "Sign out").click();
    await ask(`nobody.${projectIndex(info)}@example.test`);
    await verify();
    await expect(page.getByText("No bookings found.")).toBeVisible();
    await verifyAccessibility(page);
    await capture(page, info, "find-empty-list");

    // The server ends the session.
    await page.route("**/api/v1/guest/reservations", (route) =>
      route.fulfill({
        status: 401,
        json: { code: "PHONE_NOT_VERIFIED", title: "Verify your phone." },
      }),
    );
    await page.reload();
    await expect(page.getByText(/Your access has ended/)).toBeVisible();
    await verifyAccessibility(page);
    await capture(page, info, "find-access-ended");

    await page.route("**/api/v1/phone-verifications", (route) =>
      route.fulfill({
        status: 403,
        json: { code: "PHONE_BLOCKED", title: "Please contact the hotel." },
      }),
    );
    await ask(who.email);
    await button(page, "Continue").click();
    await button(page, "Send code").click();
    await expect(
      heading(page, "Please contact the hotel to continue"),
    ).toBeVisible();
    await verifyAccessibility(page);
    await capture(page, info, "find-contact-hotel");
  });

  // M10-T8b. Screenshots go to their own folder, so a run for them does not
  // rewrite the pictures of earlier tasks.
  const changeShot = (page: Page, info: TestInfo, state: string) =>
    screenshot(page, info, process.env.BOOKING_CHANGE_SCREENSHOTS, state);

  // Next.js keeps its own empty alert outside the booking.
  const alertIn = (page: Page) =>
    page.getByRole("region", { name: "Your booking" }).getByRole("alert");

  async function checked(page: Page, info: TestInfo, state: string) {
    await verifyAccessibility(page);
    await changeShot(page, info, state);
  }

  const bookingRow = async (reference: string) =>
    (
      await sql(
        `SELECT version, status, "totalMinor", "paymentStatus",
           to_char("checkIn", 'YYYY-MM-DD') AS "checkIn",
           to_char("checkOut", 'YYYY-MM-DD') AS "checkOut",
           "guestEmail", "specialRequests"
         FROM "Reservation" WHERE reference = $1`,
        [reference],
      )
    ).rows[0];

  const dollars = (minor: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(minor / 100);

  /** Presses the button and waits for the review of the new price. */
  async function seeNewPrice(page: Page) {
    await button(page, "See the new price").press("Enter");
    await expect(heading(page, "Check your changes")).toBeFocused();
  }

  async function openChange(page: Page) {
    await button(page, "Change booking").press("Enter");
    await expect(page.getByLabel("Check-out")).toHaveValue(/^\d{4}-/);
    await expect(heading(page, "Change booking")).toBeFocused();
  }

  test("E2E-G-9: a pay at hotel guest extends a stay with the last room and adds a room and transfer, by keyboard", async ({
    page,
    request,
  }, info) => {
    const index = projectIndex(info);
    const who = guest(info, 40);
    const headers = client(info, 5);
    const daysAhead = 210 + index * 8;
    // Deluxe Double has two units: another guest holds one for three nights.
    await book(request, headers, guest(info, 41), daysAhead, "deluxe-double", {
      nights: 3,
    });
    const made = await book(request, headers, who, daysAhead, "deluxe-double");
    // The public search counts the guest's own room, so it shows none free.
    const search = await request.get(
      `/api/v1/branches/new-cairo/availability?checkIn=${made.day(0)}&checkOut=${made.day(3)}&adults=2&children=0`,
      { headers },
    );
    expect(
      (await search.json()).results.find(
        (result: { roomType: { slug: string } }) =>
          result.roomType.slug === "deluxe-double",
      ).unitsAvailable,
    ).toBe(0);

    await page.setExtraHTTPHeaders(headers);
    const addresses: string[] = [];
    const logged: string[] = [];
    page.on("request", (sent) => addresses.push(sent.url()));
    page.on("console", (message) => logged.push(message.text()));
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(made.manageUrl);
    await expect(button(page, "Change booking")).toBeVisible();
    await checked(page, info, "change-entry");
    const before = await bookingRow(made.reference);

    await openChange(page);
    await expect(button(page, "Add a room or apartment")).toBeVisible();
    await checked(page, info, "change-form");
    await button(page, "See the new price").press("Enter");
    await expect(alertIn(page)).toContainText("Nothing has changed yet.");
    await checked(page, info, "change-nothing");

    await page.getByLabel("Check-out").fill(made.day(3));
    await button(page, "Add a room or apartment").press("Enter");
    const added = page.getByRole("group", { name: "Unit 2" });
    await added
      .getByLabel("Room or apartment")
      .selectOption("studio-with-balcony");
    await added.getByLabel("Adults").selectOption("2");
    await page
      .getByRole("checkbox", { name: /Airport transfer/ })
      .press("Space");
    await page.getByLabel("Cars").selectOption("2");
    await page.getByLabel(/Flight number/).fill("MS 985, arriving 14:30");
    await checked(page, info, "change-form-edited");
    await seeNewPrice(page);
    // A preview writes nothing.
    expect(await bookingRow(made.reference)).toEqual(before);
    await expect(
      page.getByText(dollars(before.totalMinor)).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/pay the new total at the hotel/),
    ).toBeVisible();
    await checked(page, info, "change-review");
    await button(page, "Back to the form").press("Enter");
    await expect(page.getByLabel("Check-out")).toHaveValue(made.day(3));
    await seeNewPrice(page);

    await button(page, "Confirm change").press("Enter");
    await expect(heading(page, "Your booking was changed")).toBeFocused();
    const after = await bookingRow(made.reference);
    expect(after).toMatchObject({
      version: before.version + 1,
      status: "CONFIRMED",
      checkOut: made.day(3),
    });
    await expect(
      page.getByText(dollars(after.totalMinor), { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("rowheader", {
        name: "Studio with Balcony 2 adults, 0 children",
      }),
    ).toBeVisible();
    expect(
      (
        await sql(
          `SELECT room.slug, unit.adults FROM "ReservationRoom" unit
           JOIN "Room" room ON room.id = unit."roomTypeId"
           JOIN "Reservation" r ON r.id = unit."reservationId"
           WHERE r.reference = $1 ORDER BY room.slug`,
          [made.reference],
        )
      ).rows,
    ).toEqual([
      { slug: "deluxe-double", adults: 2 },
      { slug: "studio-with-balcony", adults: 2 },
    ]);
    expect(
      (
        await sql(
          `SELECT s.kind, s.vehicles, s.details FROM "ReservationService" s
           JOIN "Reservation" r ON r.id = s."reservationId"
           WHERE r.reference = $1`,
          [made.reference],
        )
      ).rows,
    ).toEqual([
      {
        kind: "AIRPORT_TRANSFER",
        vehicles: 2,
        details: "MS 985, arriving 14:30",
      },
    ]);
    await checked(page, info, "change-applied");
    await button(page, "View my booking").press("Enter");
    await expect(heading(page, "Confirmed")).toBeVisible();
    await expect(button(page, "Change booking")).toBeVisible();

    const outside = await page.evaluate(() =>
      JSON.stringify([
        location.href,
        document.cookie,
        { ...localStorage },
        document.documentElement.outerHTML,
      ]),
    );
    for (const text of [outside, addresses.join(), logged.join()])
      noMatch(text, [made.key]);
    await expectNoSecretsStored(page, [made.key]);
  });

  test("E2E-G-9: sold out, too late, a new price, a newer booking and an open request", async ({
    page,
    request,
  }, info) => {
    const index = projectIndex(info);
    const who = guest(info, 42);
    const headers = client(info, 6);
    const made = await book(request, headers, who, 260 + index * 8);
    await page.setExtraHTTPHeaders(headers);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(made.manageUrl);
    await openChange(page);
    await expect(button(page, "Add a room or apartment")).toBeVisible();

    // Superior Double has no unit in this database.
    const unit = page.getByRole("group", { name: "Unit 1" });
    const listing = unit.getByLabel("Room or apartment");
    const held = await listing.inputValue();
    await listing.selectOption("superior-double");
    await button(page, "See the new price").press("Enter");
    await expect(
      page.getByText(/Unit 1, .* is not available for these dates/).first(),
    ).toBeVisible();
    await checked(page, info, "change-unavailable");
    await listing.selectOption(held);

    const today = localDateAt(new Date(), "Africa/Cairo").value;
    await page.getByLabel("Check-in").fill(today);
    await page.getByLabel("Check-out").fill(made.day(2));
    await button(page, "See the new price").press("Enter");
    await expect(
      page.getByText(/These new dates are too close/).first(),
    ).toBeVisible();
    await expect(page.getByLabel("Check-in")).toHaveValue(today);
    await checked(page, info, "change-dates-too-close");

    await page.getByLabel("Check-in").fill(made.day(0));
    await page.getByLabel("Check-out").fill(made.day(3));
    await button(page, "Add a room or apartment").press("Enter");
    const otherRoom = page
      .getByRole("group", { name: "Unit 2" })
      .getByLabel("Room or apartment");
    await otherRoom.selectOption("deluxe-double");
    await seeNewPrice(page);

    // Inventory can disappear after a valid preview. Block the added night
    // for every studio, then release it so the guest can check again.
    const blocked = await sql(
      `INSERT INTO "InventoryBlock" (id, "branchId", "physicalRoomId", "startDate", "endDate", reason, "createdById")
       SELECT $1::text || right(unit.id, 12), unit."branchId", unit.id, $2, $3, 'MAINTENANCE',
         (SELECT id FROM "User" WHERE role = 'ADMIN' ORDER BY id LIMIT 1)
       FROM "PhysicalRoom" unit JOIN "Room" room ON room.id = unit."roomTypeId"
       JOIN "Branch" branch ON branch.id = unit."branchId"
       WHERE branch.slug = 'new-cairo' AND room.slug = 'studio-with-balcony' AND unit.active
       RETURNING id`,
      [`e2e-change-race-${index}-`, made.day(2), made.day(3)],
    );
    try {
      expect(blocked.rowCount).toBeGreaterThan(0);
      const original = await bookingRow(made.reference);
      await button(page, "Confirm change").press("Enter");
      await expect(alertIn(page)).toContainText(
        "Unit 1, Studio with Balcony, is not available for these dates.",
      );
      await expect(page.getByLabel("Check-out")).toHaveValue(made.day(3));
      await expect(otherRoom).toHaveValue("deluxe-double");
      await expect(otherRoom).not.toHaveAttribute("aria-invalid", "true");
      expect(await bookingRow(made.reference)).toEqual(original);
      await checked(page, info, "change-inventory-race");
    } finally {
      await sql('DELETE FROM "InventoryBlock" WHERE id = ANY($1)', [
        blocked.rows.map((row) => row.id),
      ]);
    }
    await button(page, "Remove unit 2, Deluxe Double").press("Enter");
    await seeNewPrice(page);

    // Staff raise the price of the added night before the guest confirms.
    await sql(
      `INSERT INTO "RatePeriod" (id, "roomTypeId", "startDate", "endDate", "amountMinor", "updatedAt")
       SELECT $1, room.id, $2, $3, 20000, now() FROM "Room" room
       JOIN "Branch" b ON b.id = room."branchId"
       WHERE b.slug = 'new-cairo' AND room.slug = 'studio-with-balcony'`,
      [`e2e-change-rate-${index}`, made.day(2), made.day(3)],
    );
    const before = await bookingRow(made.reference);
    await button(page, "Confirm change").press("Enter");
    await expect(alertIn(page)).toContainText("The price changed.");
    await expect(button(page, "Confirm change")).toHaveCount(0);
    expect(await bookingRow(made.reference)).toEqual(before);
    await checked(page, info, "change-price-changed");
    await button(page, "Accept new total").press("Enter");

    // Somebody else saves the booking first.
    await sql(
      'UPDATE "Reservation" SET version = version + 1 WHERE reference = $1',
      [made.reference],
    );
    await button(page, "Confirm change").press("Enter");
    await expect(
      page.getByText(/This booking changed while you were editing/),
    ).toBeFocused();
    await expect(page.getByLabel("Check-out")).toHaveValue(made.day(2));
    await checked(page, info, "change-reloaded");

    // A lost reply: the change was made, and nothing is sent again.
    await page.getByLabel("Check-out").fill(made.day(3));
    await seeNewPrice(page);
    let sent = 0;
    await page.route("**/api/v1/guest/reservation/changes", async (route) => {
      sent += 1;
      await route.fetch();
      await route.abort("failed");
    });
    await button(page, "Confirm change").press("Enter");
    await expect(
      page.getByText(/couldn’t confirm whether your change was made/),
    ).toBeFocused();
    await expect(heading(page, "Confirmed")).toBeVisible();
    expect(sent).toBe(1);
    expect((await bookingRow(made.reference)).checkOut).toBe(made.day(3));
    await checked(page, info, "change-lost-reply");

    // A request made in another tab closes the change.
    await openChange(page);
    const asked = await request.post(
      "/api/v1/guest/reservation/cancellation-requests",
      {
        headers: { ...headers, Authorization: `Bearer ${made.key}` },
        data: {},
      },
    );
    expect(asked.status()).toBe(201);
    await page.getByLabel("Check-out").fill(made.day(2));
    await button(page, "See the new price").press("Enter");
    await expect(
      heading(page, "Contact the hotel about this change"),
    ).toBeFocused();
    await checked(page, info, "change-closed");
    await button(page, "Back to my booking").press("Enter");
    await expect(heading(page, "Cancellation requested")).toBeVisible();
    await expect(button(page, "Change booking")).toHaveCount(0);
  });

  test("E2E-G-9: a paid change with a new total goes to the hotel", async ({
    page,
    request,
  }, info) => {
    const index = projectIndex(info);
    const who = guest(info, 43);
    const headers = client(info, 7);
    const made = await book(
      request,
      headers,
      who,
      310 + index * 8,
      "studio-with-balcony",
      { online: true },
    );
    await page.setExtraHTTPHeaders(headers);
    await page.goto(made.checkoutUrl!);
    await button(page, "Pay successfully").click();
    await expect
      .poll(async () => (await bookingRow(made.reference)).paymentStatus)
      .toBe("PAID");
    const before = await bookingRow(made.reference);

    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(made.manageUrl);
    await openChange(page);
    await page.getByLabel("Check-out").fill(made.day(3));
    await seeNewPrice(page);
    await expect(page.getByText(/the hotel must approve/)).toBeVisible();
    await checked(page, info, "change-review-approval");
    await button(page, "Send to the hotel for approval").press("Enter");
    await expect(heading(page, "Sent to the hotel for approval")).toBeFocused();
    expect(await bookingRow(made.reference)).toEqual(before);
    expect(
      (
        await sql(
          `SELECT c.status FROM "ChangeRequest" c JOIN "Reservation" r
             ON r.id = c."reservationId" WHERE r.reference = $1`,
          [made.reference],
        )
      ).rows,
    ).toEqual([{ status: "OPEN" }]);
    await checked(page, info, "change-sent");
    await button(page, "Back to my booking").press("Enter");
    await expect(heading(page, "Change sent to the hotel")).toBeVisible();
    await expect(button(page, "Change booking")).toHaveCount(0);
    await checked(page, info, "change-request-open");
  });

  test("E2E-G-9: a new email ends the private link, and My reservations can change the booking", async ({
    page,
    request,
  }, info) => {
    const index = projectIndex(info);
    const who = guest(info, 44);
    const headers = client(info, 8);
    const made = await book(request, headers, who, 360 + index * 8);
    await page.setExtraHTTPHeaders(headers);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(made.manageUrl);
    await openChange(page);
    await page.getByLabel("Email", { exact: true }).fill(`new.${who.email}`);
    await seeNewPrice(page);
    await button(page, "Confirm change").press("Enter");
    await expect(heading(page, "Your booking was changed")).toBeFocused();
    await expect(
      page.getByText(/this private link no longer works/),
    ).toBeVisible();
    await checked(page, info, "change-email-link-ended");
    expect(
      await page.evaluate(() => sessionStorage.getItem("rivana.access.manage")),
    ).toBeNull();
    const old = await request.get("/api/v1/guest/reservation", {
      headers: { ...headers, Authorization: `Bearer ${made.key}` },
    });
    expect(old.status()).toBe(401);

    await page
      .getByRole("main")
      .getByRole("link", { name: "My reservations" })
      .click();
    await page.getByLabel("Phone country").selectOption("US");
    await page.getByLabel("Phone number", { exact: true }).fill(who.typed);
    await button(page, "Continue").click();
    const sent = page.waitForResponse((response) =>
      response.url().endsWith("/api/v1/phone-verifications"),
    );
    await button(page, "Send code").click();
    const { verificationId } = await (await sent).json();
    await setKnownCode(verificationId, code);
    await page.getByLabel("Verification code").fill(code);
    await button(page, "Verify code").click();
    await button(page, `View booking ${made.reference}`).click();
    await openChange(page);
    await page.getByLabel(/Special requests/).fill("A high floor, please");
    await seeNewPrice(page);
    await button(page, "Confirm change").press("Enter");
    await expect(heading(page, "Your booking was changed")).toBeFocused();
    await button(page, "View my booking").press("Enter");
    await expect(page.getByText("A high floor, please")).toBeVisible();
    await checked(page, info, "find-booking-changed");
    expect(await bookingRow(made.reference)).toMatchObject({
      guestEmail: `new.${who.email}`,
      specialRequests: "A high floor, please",
    });
  });
});
