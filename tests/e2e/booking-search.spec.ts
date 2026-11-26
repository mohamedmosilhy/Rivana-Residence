import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { localDateAt } from "../../src/domain/shared/zoned-time";

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

async function verifyAccessibility(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.filter(
      ({ impact }) => impact === "serious" || impact === "critical",
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  const targets = await page
    .locator("main :is(input:not([type=hidden]), button, a, summary)")
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => {
          const { width, height } = element.getBoundingClientRect();
          return {
            name: element.textContent?.trim() || element.getAttribute("name"),
            width,
            height,
          };
        }),
    );
  expect(
    targets.filter(({ width, height }) => width < 44 || height < 44),
  ).toEqual([]);
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
    const {
      rows: [period],
    } = await sql(
      `SELECT ("startDate"::date - 1)::text AS "checkIn", "endDate"::date::text AS "checkOut"
       FROM "RatePeriod" WHERE id = 'e2e-booking-search-period'`,
    );
    const dates = {
      checkIn: String(period.checkIn),
      checkOut: String(period.checkOut),
      adults: "2",
      children: "0",
    };
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
