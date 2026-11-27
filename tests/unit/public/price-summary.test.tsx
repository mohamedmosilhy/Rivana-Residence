import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { PriceSummary } from "@/presentation/features/booking/price-summary";

import { bookingQuote, stayTimes, usd } from "./booking-extras-fixtures";

const rows = () => screen.getAllByRole("row").map((row) => row.textContent);

/** Figures that do not add up: the page must show them exactly as they came. */
const quote = bookingQuote({
  services: [
    {
      kind: "AIRPORT_TRANSFER",
      unit: "PER_VEHICLE",
      vehicles: 2,
      price: usd(3000),
      childPrice: null,
      adults: 2,
      children: 0,
      nights: 2,
      adultQuantity: 2,
      childQuantity: 0,
      amount: usd(6111),
    },
  ],
  coupon: {
    code: "SAVE10",
    kind: "PERCENT",
    percentBasisPoints: 1000,
    amount: null,
  },
  subtotal: usd(22_222),
  discount: usd(333),
  vatRateBasisPoints: 1450,
  vat: usd(4444),
  total: usd(99_999),
});

it("lists the server's units, extras, discount, VAT rate and total", () => {
  render(
    <PriceSummary
      times={stayTimes}
      quote={quote}
      stale={null}
      changeHref="/back"
    />,
  );
  expect(
    screen.getByRole("table", { name: "Price of your stay" }),
  ).toBeVisible();
  expect(rows()).toStrictEqual([
    "Deluxe Double2 adults, 0 children$160.00",
    "Airport transfer2 cars$61.11",
    "Subtotal$222.22",
    "DiscountCode SAVE10−$3.33",
    "VAT (14.5%)$44.44",
    "Total$999.99",
  ]);
  expect(screen.getByText("2 nights", { exact: false })).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Change selection" }),
  ).toHaveAttribute("href", "/back");
});

it("shows no discount line without a coupon", () => {
  render(
    <PriceSummary
      times={stayTimes}
      quote={bookingQuote()}
      stale={null}
      changeHref="/back"
    />,
  );
  expect(rows().join()).not.toContain("Discount");
  expect(rows()).toContain("VAT (15%)$24.00");
});

it("hides figures that do not answer the current choices", () => {
  render(
    <PriceSummary
      times={stayTimes}
      quote={quote}
      stale="Updating price…"
      changeHref="/back"
    />,
  );
  expect(screen.getByText("Updating price…")).toBeVisible();
  expect(screen.getByRole("table", { hidden: true })).toHaveClass("invisible");
});

it("shows each unit's server nightly amounts and seasonal label on review", () => {
  const line = quote.lines[0]!;
  render(
    <PriceSummary
      times={stayTimes}
      nightly
      quote={{
        ...quote,
        lines: [
          line,
          {
            ...line,
            roomName: "Apartment",
            nights: [
              { night: "2026-12-03", label: "Winter", amount: usd(12456) },
            ],
          },
        ],
      }}
      stale={null}
      changeHref="/back"
    />,
  );
  expect(rows().find((row) => row?.startsWith("Apartment"))).toContain(
    "Thu, 3 Dec (Winter) · $124.56",
  );
  expect(rows().join()).toContain("Fri, 4 Dec · $80.00");
});

it("shows each end of the stay as its date and the hotel's hours", () => {
  render(
    <PriceSummary
      times={stayTimes}
      quote={bookingQuote()}
      stale={null}
      changeHref="/back"
    />,
  );
  expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual([
    "Check-in",
    "Check-out",
  ]);
  expect(
    screen.getAllByRole("definition").map((item) => item.textContent),
  ).toEqual([
    "Thu, 3 Dec 2026",
    "2:00 PM – 11:30 PM",
    "Sat, 5 Dec 2026",
    "12:00 AM – 11:30 AM",
  ]);
});
