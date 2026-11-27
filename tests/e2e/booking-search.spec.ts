import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { localDateAt } from "../../src/domain/shared/zoned-time";

import { verifyAccessibility } from "./support/booking";
import { sql } from "./support/session";

const booking = "/new-cairo/book";
const ready = process.env.BOOKING_SEARCH_E2E === "1";
const today = () => localDateAt(new Date(), "Africa/Cairo");
const stay = (daysAhead: number, adults = 2, from = today()) => ({
  checkIn: from.addDays(daysAhead).value,
  checkOut: from.addDays(daysAhead + 2).value,
  adults: String(adults),
  children: "0",
});
const search = (params: Record<string, string>) =>
  `${booking}?${new URLSearchParams(params)}`;

async function seasonalStay() {
  const {
    rows: [period],
  } = await sql(
    `SELECT ("startDate"::date - 1)::text AS "checkIn", "endDate"::date::text AS "checkOut"
     FROM "RatePeriod" WHERE id = 'e2e-booking-search-period'`,
  );
  return {
    checkIn: String(period.checkIn),
    checkOut: String(period.checkOut),
    adults: "2",
    children: "0",
  };
}

async function capture(page: Page, name: string, fullPage = false) {
  const directory = process.env.BOOKING_SEARCH_SCREENSHOTS;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(directory, `${name}.png`),
    fullPage,
    animations: "disabled",
    scale: "css",
  });
}

async function captureSelection(page: Page, name: string, desktop: boolean) {
  const directory = process.env.BOOKING_SELECTION_SCREENSHOTS;
  if (!directory) return;
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
    path: path.join(directory, `${name}-${desktop ? "desktop" : "mobile"}.png`),
    fullPage: true,
    animations: "disabled",
    scale: "css",
  });
}

test("the booking page gives contact details while booking is off", async ({
  page,
}, testInfo) => {
  test.skip(ready, "The focused search suite enables this branch.");
  await page.setViewportSize({ width: 320, height: 760 });
  const response = await page.goto(search(stay(7)));
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Book with the hotel" }),
  ).toBeVisible();
  const contact = page.getByRole("region", { name: "Book with the hotel" });
  await expect(
    contact.getByRole("link", { name: "+20 2 1234 5678" }),
  ).toHaveAttribute("href", "tel:+20212345678");
  await expect(
    contact.getByRole("link", { name: "stay@example.test" }),
  ).toHaveAttribute("href", "mailto:stay@example.test");
  await expect(
    contact.getByRole("link", { name: "Contact the hotel" }),
  ).toHaveAttribute("href", "/new-cairo/contact");
  await expect(page.getByRole("form", { name: "Stay search" })).toHaveCount(0);
  await verifyAccessibility(page);
  if (testInfo.project.name === "mobile-chromium") {
    await capture(page, "booking-off-320");
  }
});

test("the details page gives contact details while booking is off", async ({
  page,
}) => {
  test.skip(ready, "The focused search suite enables this branch.");
  await page.setViewportSize({ width: 320, height: 760 });
  // Booking is refused before the address is read.
  const response = await page.goto(`${booking}/details?u=anything`);
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Book with the hotel" }),
  ).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
  await verifyAccessibility(page);
});

test("unknown and inactive branch booking pages return 404", async ({
  request,
}) => {
  expect((await request.get("/branch-that-does-not-exist/book")).status()).toBe(
    404,
  );
  expect((await request.get("/demo-giza/book")).status()).toBe(404);
});

test.describe("with booking available", () => {
  test.skip(!ready, "Run the focused BOOKING_SEARCH_E2E=1 search suite.");

  test("AC-2 selects a room and apartment, checks the server subtotal, and links to the details page", async ({
    page,
  }, testInfo) => {
    const desktop = testInfo.project.name === "desktop-chromium";
    const captureState = testInfo.project.name.endsWith("chromium");
    const dates = await seasonalStay();
    await page.goto(search(dates));
    const initialWidth = await page.evaluate(() => innerWidth);
    if (captureState) await captureSelection(page, "empty-selection", desktop);
    const basket = page.getByRole("region", { name: "Your selection" });
    const room = page.getByRole("button", {
      name: "Add to stay: Deluxe Double",
    });
    const apartment = page.getByRole("button", {
      name: "Add to stay: Studio with Balcony",
    });
    // The action also works by keyboard with the server-rendered cards.
    await room.press("Enter");
    const roomCard = page.getByRole("article").filter({ has: room });
    await expect(
      roomCard.getByText("1 selected", { exact: true }),
    ).toBeVisible();
    await expect(
      roomCard.getByRole("link", { name: "View selection" }),
    ).toHaveAttribute("href", "#booking-selection");
    await apartment.press("Space");
    const unit = basket.getByRole("group", {
      name: "Studio with Balcony · Unit 2",
    });
    const resultPromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/quotes") &&
        response.request().postDataJSON().lines[1]?.occupancy.children === 1,
    );
    await unit.getByLabel("Children").selectOption("1");
    const response = await resultPromise;
    expect(response.ok()).toBe(true);
    const quote = await response.json();
    expect(quote.quote.accommodation.amountMinor).toBe(42_000);
    expect(response.request().postDataJSON()).toEqual({
      branchSlug: "new-cairo",
      stay: { checkIn: dates.checkIn, checkOut: dates.checkOut },
      lines: [
        { roomSlug: "deluxe-double", occupancy: { adults: 2, children: 0 } },
        {
          roomSlug: "studio-with-balcony",
          occupancy: { adults: 2, children: 1 },
        },
      ],
      services: [],
    });
    await expect(basket.getByText("$420.00")).toBeVisible();
    const next = basket.getByRole("link", { name: "Continue" });
    const href = new URL((await next.getAttribute("href"))!, page.url());
    expect(href.pathname).toBe("/new-cairo/book/details");
    expect(Object.fromEntries(href.searchParams)).toEqual({
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
      u: "deluxe-double.2.0,studio-with-balcony.2.1",
    });
    if (captureState) await captureSelection(page, "mixed-selection", desktop);
    await page.setViewportSize({ width: 320, height: 844 });
    await verifyAccessibility(page);
    await page.setViewportSize({ width: initialWidth, height: 844 });

    for (let count = 0; count < 3; count++) await apartment.click();
    await expect(basket.getByText("5 of 5 units selected")).toBeVisible();
    await expect(apartment).toHaveAccessibleDescription(
      "All 4 available units selected.",
    );
    await expect(room).toHaveAccessibleDescription(
      "Maximum 5 units per booking.",
    );
    await expect(apartment).toBeDisabled();
    await expect(room).toBeDisabled();
    await expect(basket.getByText("$1,200.00")).toBeVisible();
    if (captureState) await captureSelection(page, "selection-limit", desktop);
    await basket
      .getByRole("button", { name: "Remove Studio with Balcony, unit 5" })
      .click();
    await expect(
      basket.getByRole("heading", { name: "Your selection" }),
    ).toBeFocused();
    await expect(room).toBeEnabled();
    await expect(basket.getByText("$940.00")).toBeVisible();
    await page.goto(search(stay(8)));
    await expect(
      basket.getByText("Choose up to 5 rooms or apartments for this stay."),
    ).toBeVisible();
  });

  // The production build: no code is sent, so no provider is called.
  test("prices the selection on the details page and rebuilds it on the way back", async ({
    page,
  }) => {
    const dates = await seasonalStay();
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(search(dates));
    await page
      .getByRole("button", { name: "Add to stay: Deluxe Double" })
      .click();
    const basket = page.getByRole("region", { name: "Your selection" });
    await basket.getByRole("link", { name: "Continue" }).click();
    await expect(
      page.getByRole("heading", { name: "Your details" }),
    ).toBeVisible();
    const stayPanel = page.getByRole("complementary", { name: "Your stay" });
    await expect(stayPanel.getByText("Deluxe Double")).toBeVisible();
    await expect(stayPanel.getByText("$160.00")).toHaveCount(2);
    await verifyAccessibility(page);

    // The browser's own Back rebuilds the basket from the address.
    await page.goBack();
    await expect(
      basket.getByRole("group", { name: "Deluxe Double · Unit 1" }),
    ).toBeVisible();
    await basket.getByRole("link", { name: "Continue" }).click();
    await page.getByRole("link", { name: "Change selection" }).click();
    await expect(page).toHaveURL(/\/new-cairo\/book\?.*u=deluxe-double/);
    await expect(
      basket.getByRole("group", { name: "Deluxe Double · Unit 1" }),
    ).toBeVisible();

    const details = (u: string) =>
      `${booking}/details?${new URLSearchParams({
        checkIn: dates.checkIn,
        checkOut: dates.checkOut,
        u,
      })}`;
    // Superior Double has no unit: back to the results with the reason.
    await page.goto(details("deluxe-double.2.0,superior-double.2.0"));
    await expect(page).toHaveURL(/notice=unavailable/);
    await expect(
      page.getByText("Part of your selection is no longer available."),
    ).toBeVisible();
    await expect(
      basket.getByRole("group", { name: "Deluxe Double · Unit 1" }),
    ).toBeVisible();
    await expect(basket.getByRole("group")).toHaveCount(1);
    await verifyAccessibility(page);
    await page.goto(details("no-such-listing.2.0"));
    await expect(page).toHaveURL(/notice=selection/);
    await expect(
      page.getByText("We couldn’t open that selection."),
    ).toBeVisible();
  });

  test("keeps units through quote failures and offers a fresh check when availability changes", async ({
    page,
  }, testInfo) => {
    const desktop = testInfo.project.name === "desktop-chromium";
    const captureState = testInfo.project.name.endsWith("chromium");
    const quotes = "**/api/v1/quotes";
    const dates = await seasonalStay();
    const basket = page.getByRole("region", { name: "Your selection" });
    await page.route(
      quotes,
      async (route) => {
        await route.abort("internetdisconnected");
      },
      { times: 1 },
    );
    await page.goto(search(dates));
    await page
      .getByRole("button", { name: "Add to stay: Deluxe Double" })
      .click();
    await expect(
      basket.getByText("We couldn’t check the price. Please try again."),
    ).toBeVisible();
    await expect(basket.getByText("1 of 5 units selected")).toBeVisible();
    if (captureState) await captureSelection(page, "quote-error", desktop);
    const retry = basket.getByRole("button", { name: "Check again" });
    await retry.press("Enter");
    await expect(
      basket.getByRole("heading", { name: "Your selection" }),
    ).toBeFocused();
    await expect(basket.getByText("$160.00")).toBeVisible();

    await page.route(
      quotes,
      async (route) => {
        await route.fulfill({
          json: {
            available: false,
            bookable: false,
            unavailableLines: [1, 2],
            quote: null,
            paymentMethods: [],
          },
        });
      },
      { times: 1 },
    );
    const apartment = page.getByRole("button", {
      name: "Add to stay: Studio with Balcony",
    });
    await apartment.dblclick();
    await expect(
      basket.getByText(
        "Availability changed. Adjust your selection or check again.",
      ),
    ).toBeVisible();
    const affected = basket.getByRole("group", {
      name: "Studio with Balcony · Unit 2",
    });
    await expect(affected).toHaveAccessibleDescription(
      "The full quantity is unavailable. Try removing a unit of this type.",
    );
    await expect(
      basket.getByText("The full quantity is unavailable.", { exact: false }),
    ).toHaveCount(1);
    await expect(basket.getByText("$160.00")).toHaveCount(0);
    await expect(basket.getByRole("link", { name: "Continue" })).toHaveCount(0);
    if (captureState)
      await captureSelection(page, "availability-changed", desktop);
    await basket
      .getByRole("button", { name: "Remove Studio with Balcony, unit 3" })
      .click();
    await expect(basket.getByText("$420.00")).toBeVisible();

    const occupancyError =
      "This listing sleeps at most 1 adults and 0 children.";
    await page.route(
      quotes,
      (route) =>
        route.fulfill({
          status: 422,
          json: {
            code: "VALIDATION",
            title: "Check the units.",
            fieldErrors: { "lines.1.occupancy": [occupancyError] },
          },
        }),
      { times: 1 },
    );
    await affected.getByLabel("Children").selectOption("1");
    await expect(affected).toHaveAccessibleDescription(occupancyError);
    await expect(basket.getByText("$420.00")).toHaveCount(0);
    await affected.getByLabel("Adults").selectOption("1");
    await affected.getByLabel("Children").selectOption("0");
    await expect(basket.getByText("$420.00")).toBeVisible();
  });

  test("submits by keyboard without JavaScript and shows exact prices and unavailable reasons", async ({
    baseURL,
    browser,
    browserName,
    extraHTTPHeaders,
    page,
  }, testInfo) => {
    const desktop = testInfo.project.name.includes("desktop");
    const viewport = desktop
      ? { width: 1280, height: 920 }
      : { width: 390, height: 844 };
    const dates = await seasonalStay();
    const context = await browser.newContext({
      ...(baseURL ? { baseURL } : {}),
      ...(extraHTTPHeaders ? { extraHTTPHeaders } : {}),
      javaScriptEnabled: false,
      viewport,
    });
    try {
      const native = await context.newPage();
      await native.goto(`${booking}?room=studio-with-balcony`);
      await native.getByLabel("Check-in").fill(dates.checkIn);
      await native.getByLabel("Check-out").fill(dates.checkOut);
      await native.getByLabel("Adults").fill(dates.adults);
      await native.getByLabel("Children").fill(dates.children);

      await native
        .getByLabel("Children")
        .press(browserName === "webkit" ? "Alt+Tab" : "Tab");
      const button = native.getByRole("button", { name: "Check availability" });
      await expect(button).toBeFocused();
      await button.press("Enter");
      const title = native.getByRole("heading", { name: "Available stays" });
      await expect(title).toBeVisible();
      await expect(native).toHaveURL(
        /room=studio-with-balcony.*#search-feedback$/,
      );
      await expect(title).toBeFocused();
      const apartment = native
        .getByRole("article")
        .filter({ hasText: "Studio with Balcony" });
      await expect(
        apartment.getByText("Apartment", { exact: true }),
      ).toBeVisible();
      await expect(apartment.getByText("Your selected listing")).toBeVisible();
      await expect(
        apartment.getByText("$260.00", { exact: true }),
      ).toBeVisible();
      await apartment.getByText("Show nightly prices").click();
      await expect(
        apartment.getByText("$120.00", { exact: true }),
      ).toBeVisible();
      await expect(
        apartment.getByText("$140.00", { exact: true }),
      ).toBeVisible();
      const room = native
        .getByRole("article")
        .filter({ hasText: "Deluxe Double" });
      await expect(room.getByText("$80.00 per night")).toBeVisible();
      await expect(room.getByText("$160.00", { exact: true })).toBeVisible();
      const unavailable = native.getByRole("region", {
        name: "Unavailable for this search",
      });
      await expect(unavailable.getByText("Superior Double")).toBeVisible();
      await expect(
        unavailable.getByText("Not available for these dates."),
      ).toBeVisible();
      await expect(
        native.getByText(/Private Draft Room|Retired Room|Giza/),
      ).toHaveCount(0);
      await expect(
        room.getByRole("link", { name: "View details for Deluxe Double" }),
      ).toHaveAttribute("href", "/new-cairo/stay/deluxe-double");
    } finally {
      await context.close();
    }
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(search(dates));
    await verifyAccessibility(page);

    if (testInfo.project.name.endsWith("chromium")) {
      await page.setViewportSize(viewport);
      await capture(page, `search-results-${viewport.width}`, true);
      await page.goto(booking);
      await capture(page, `search-form-${viewport.width}`);
    }
  });

  test("announces invalid dates, keeps values, and lets the guest correct them", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(booking);
    const dates = stay(7);
    await page.getByLabel("Check-in").fill(dates.checkIn);
    await page.getByLabel("Check-out").fill(dates.checkIn);
    await page.getByRole("button", { name: "Check availability" }).click();
    const error = page.getByRole("heading", {
      name: "Check your search details",
    });
    await expect(error).toBeFocused();
    await expect(page.getByLabel("Check-out")).toHaveAccessibleDescription(
      "Check-out must be after check-in.",
    );
    await expect(page.getByLabel("Check-in")).toHaveValue(dates.checkIn);
    await verifyAccessibility(page);
    if (testInfo.project.name === "mobile-chromium") {
      await capture(page, "invalid-dates-320", true);
    }
    await page.getByLabel("Check-out").fill(dates.checkOut);
    await page.getByRole("button", { name: "Check availability" }).click();
    await expect(
      page.getByRole("heading", { name: "Available stays" }),
    ).toBeFocused();
  });

  test("records no availability without a session and honors request privacy", async ({
    page,
  }, testInfo) => {
    const days =
      13 +
      [
        "desktop-chromium",
        "mobile-chromium",
        "webkit-desktop",
        "webkit-tablet",
        "webkit-phone",
      ].indexOf(testInfo.project.name) *
        7;
    const from = today();
    const dates = stay(days, 8, from);
    const last = stay(days + 4, 8, from);
    const namedSession = randomBytes(16).toString("hex");
    await page.setExtraHTTPHeaders({
      "Rivana-Analytics-Session": namedSession,
    });
    await page.goto(search(stay(days, 2, from)));
    await expect(
      page.getByRole("heading", { name: "Available stays" }),
    ).toBeVisible();
    await page.goto(search(dates));
    await expect(
      page.getByRole("heading", { name: "No stays available" }),
    ).toBeVisible();
    await expect(
      page.getByText("Does not fit the number of guests entered."),
    ).toHaveCount(3);
    const events = async () =>
      (
        await sql(
          `SELECT e.name, e.outcome, e."sessionId", e."funnelStep", e.path,
                  e."stayCheckIn"::text, e."stayCheckOut"::text
         FROM "SiteEvent" e JOIN "Branch" b ON b.id = e."branchId"
         WHERE b.slug = 'new-cairo' AND e."stayCheckIn" BETWEEN $1::date AND $2::date
         ORDER BY e."stayCheckIn", e.id`,
          [dates.checkIn, last.checkIn],
        )
      ).rows;
    const expected = ({ checkIn, checkOut }: typeof dates) => ({
      name: "SEARCH",
      outcome: "NO_AVAILABILITY",
      sessionId: null,
      funnelStep: null,
      path: null,
      stayCheckIn: checkIn,
      stayCheckOut: checkOut,
    });
    await expect.poll(events).toEqual([expected(dates)]);
    for (const [offset, name] of ["DNT", "Sec-GPC", "Purpose"].entries()) {
      await page.setExtraHTTPHeaders({
        [name]: name === "Purpose" ? "prefetch" : "1",
      });
      await page.goto(search(stay(days + offset + 1, 8, from)));
      await expect(
        page.getByRole("heading", { name: "No stays available" }),
      ).toBeVisible();
    }
    await page.setExtraHTTPHeaders({});
    await page.goto(search(last));
    await expect.poll(events).toEqual([expected(dates), expected(last)]);
    const suppliedSession = await sql(
      'SELECT id FROM "SiteEvent" WHERE "sessionId" = $1',
      [namedSession],
    );
    expect(suppliedSession.rows).toEqual([]);
  });
});
