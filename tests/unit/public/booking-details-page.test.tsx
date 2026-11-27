import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { failure, rateLimited, success } from "@/application/shared/result";
import { LocalDate } from "@/domain/shared/local-date";
import { Money } from "@/domain/shared/money";
import { StayRange } from "@/domain/shared/stay-range";

const { getBookingSetup, quoteBookingDetails, redirect, journey } = vi.hoisted(
  () => ({
    getBookingSetup: vi.fn(),
    quoteBookingDetails: vi.fn(),
    redirect: vi.fn((href: string) => {
      throw new Error(`redirect:${href}`);
    }),
    journey: vi.fn(),
  }),
);

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));
vi.mock("next/navigation", () => ({
  redirect,
  notFound: () => {
    throw new Error("not-found");
  },
}));
vi.mock("@/composition/booking-details", () => ({
  getBookingSetup,
  quoteBookingDetails,
}));
vi.mock("@/presentation/features/booking/booking-journey", () => ({
  BookingJourney: (props: { summary: ReactNode }) => {
    journey(props);
    return (
      <>
        {props.summary}
        <p>journey</p>
      </>
    );
  },
}));
vi.mock("@/app/(marketing)/site-content", () => ({
  requireBranch: async () => ({
    id: "branch-id",
    slug: "new-cairo",
    name: "New Cairo",
    hero: null,
  }),
  pageMetadata: async (value: object) => value,
}));

const { default: Page, generateMetadata } = await import(
  "@/app/(marketing)/[branch]/book/details/page"
);

const query = {
  checkIn: "2026-12-03",
  checkOut: "2026-12-05",
  u: "deluxe.2.0",
};
const setup = (overrides: object = {}) => ({
  bookable: true,
  channels: { whatsapp: true, email: true },
  phone: "+20 2 1234 5678",
  email: "stay@example.test",
  services: [
    {
      kind: "BREAKFAST",
      unit: "PER_PERSON_PER_NIGHT",
      price: Money.create({ amountMinor: 1000, currency: "USD" }),
      childPrice: Money.create({ amountMinor: 500, currency: "USD" }),
    },
    {
      kind: "AIRPORT_TRANSFER",
      unit: "PER_VEHICLE",
      price: Money.create({ amountMinor: 3000, currency: "USD" }),
      childPrice: null,
    },
  ],
  maxVehicles: 3,
  ...overrides,
});
const quoted = (overrides: object = {}) =>
  success({
    available: true,
    bookable: true,
    paymentMethods: ["PAY_AT_HOTEL", "ONLINE"],
    quote: {
      stay: StayRange.create(
        LocalDate.parse(query.checkIn),
        LocalDate.parse(query.checkOut),
      ),
      lines: [
        {
          roomTypeId: "room-id",
          roomSlug: "deluxe",
          roomName: "Deluxe Double",
          accommodationType: "ROOM",
          occupancy: { adults: 2, children: 0 },
          nights: [
            {
              night: LocalDate.parse(query.checkIn),
              amount: Money.create({ amountMinor: 16_000, currency: "USD" }),
              label: null,
            },
          ],
          accommodationMinor: 16_000,
        },
      ],
      serviceLines: [],
      appliedCoupon: null,
      accommodationMinor: 16_000,
      servicesMinor: 0,
      subtotalMinor: 16_000,
      discountMinor: 0,
      taxableMinor: 16_000,
      vatRateBasisPoints: 1500,
      vatMinor: 2400,
      totalMinor: 18_400,
    },
    ...overrides,
  });

async function open(searchParams: Record<string, string> = query) {
  render(
    await Page({
      params: Promise.resolve({ branch: "new-cairo" }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

beforeEach(() => {
  getBookingSetup.mockResolvedValue(setup());
  quoteBookingDetails.mockResolvedValue(quoted());
});
afterEach(() => vi.clearAllMocks());

describe("booking details page", () => {
  it("is not indexed", async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ branch: "new-cairo" }) }),
    ).resolves.toMatchObject({ robots: { index: false, follow: false } });
  });

  it("prices the selection for the server's branch and shows it with the journey", async () => {
    await open();
    expect(quoteBookingDetails).toHaveBeenCalledWith(
      {
        branchSlug: "new-cairo",
        stay: { checkIn: query.checkIn, checkOut: query.checkOut },
        lines: [{ roomSlug: "deluxe", occupancy: { adults: 2, children: 0 } }],
        services: [],
      },
      expect.any(Headers),
    );
    expect(screen.getByText("Deluxe Double")).toBeVisible();
    expect(screen.getAllByText("$160.00")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "Change selection" }),
    ).toHaveAttribute(
      "href",
      "/new-cairo/book?checkIn=2026-12-03&checkOut=2026-12-05&adults=2&children=0&u=deluxe.2.0",
    );
    expect(journey).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: { whatsapp: true, email: true },
        lifetimes: { codeLifetimeMs: 600_000, tokenLifetimeMs: 1_800_000 },
      }),
    );
  });

  it("hands the journey plain money and the server's own quote", async () => {
    await open();
    const props = journey.mock.calls[0]![0] as Record<string, unknown>;
    // Class instances cannot cross to the browser.
    expect(JSON.parse(JSON.stringify(props.services))).toStrictEqual(
      props.services,
    );
    expect(props).toMatchObject({
      selection: {
        branchSlug: "new-cairo",
        stay: { checkIn: query.checkIn, checkOut: query.checkOut },
        lines: [{ roomSlug: "deluxe", occupancy: { adults: 2, children: 0 } }],
      },
      services: [
        {
          kind: "BREAKFAST",
          price: { amountMinor: 1000, currency: "USD" },
          childPrice: { amountMinor: 500, currency: "USD" },
        },
        { kind: "AIRPORT_TRANSFER", childPrice: null },
      ],
      maxVehicles: 3,
      price: {
        paymentMethods: ["PAY_AT_HOTEL", "ONLINE"],
        quote: {
          stay: { checkIn: query.checkIn, checkOut: query.checkOut },
          total: { amountMinor: 18_400, currency: "USD" },
        },
      },
    });
    expect(JSON.stringify(props.price)).not.toContain("room-id");
  });

  it("offers no email code when the quote cannot be paid online (AC-14)", async () => {
    quoteBookingDetails.mockResolvedValue(
      quoted({ paymentMethods: ["PAY_AT_HOTEL"] }),
    );
    await open();
    expect(journey).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: { whatsapp: true, email: false },
      }),
    );
  });

  it.each([
    [
      "booking is off",
      () => getBookingSetup.mockResolvedValue(setup({ bookable: false })),
    ],
    [
      "the quote says booking closed",
      () => quoteBookingDetails.mockResolvedValue(quoted({ bookable: false })),
    ],
    [
      "no channel can serve this quote",
      () => {
        getBookingSetup.mockResolvedValue(
          setup({ channels: { whatsapp: false, email: true } }),
        );
        quoteBookingDetails.mockResolvedValue(
          quoted({ paymentMethods: ["PAY_AT_HOTEL"] }),
        );
      },
    ],
  ])("shows the hotel contact when %s", async (_name, arrange) => {
    arrange();
    await open();
    expect(
      screen.getByRole("heading", { name: "Book with the hotel" }),
    ).toBeVisible();
    expect(journey).not.toHaveBeenCalled();
  });

  it("does not price anything while booking is off", async () => {
    getBookingSetup.mockResolvedValue(setup({ bookable: false }));
    await open({});
    expect(quoteBookingDetails).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends an unreadable address back to the search without pricing it", async () => {
    await expect(open({ ...query, u: "bad" })).rejects.toThrow(
      "redirect:/new-cairo/book?checkIn=2026-12-03&checkOut=2026-12-05&adults=1&children=0&notice=selection",
    );
    expect(quoteBookingDetails).not.toHaveBeenCalled();
  });

  it("sends a refused selection back with that reason", async () => {
    quoteBookingDetails.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION", message: "Check the units." },
    });
    await expect(open()).rejects.toThrow("notice=selection");
  });

  it("sends a sold out selection back to the results, keeping it", async () => {
    quoteBookingDetails.mockResolvedValue(
      quoted({ available: false, quote: null, bookable: false }),
    );
    await expect(open()).rejects.toThrow("u=deluxe.2.0&notice=unavailable");
  });

  it("shows the wait when price checks are limited", async () => {
    quoteBookingDetails.mockResolvedValue(
      rateLimited("Too many price checks.", 42),
    );
    await open();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Please wait 42 seconds",
    );
    expect(screen.getByRole("link", { name: "Try again" })).toBeVisible();
  });

  it("offers a retry on a failure and logs no details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    quoteBookingDetails.mockRejectedValue(
      new TypeError("deluxe.2.0 is in this message"),
    );
    await open();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn’t check your selection",
    );
    expect(log).toHaveBeenCalledExactlyOnceWith(
      "[booking-details] quote failed: TypeError",
    );
    log.mockRestore();
  });

  it("is a 404 for a branch the quote cannot find", async () => {
    quoteBookingDetails.mockResolvedValue(
      failure("NOT_FOUND", "This branch was not found."),
    );
    await expect(open()).rejects.toThrow("not-found");
  });
});
