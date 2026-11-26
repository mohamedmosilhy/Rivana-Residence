import { render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { PublicAvailability } from "@/application/public";
import { rateLimited, success } from "@/application/shared/result";
import { LocalDate } from "@/domain/shared/local-date";
import { Occupancy } from "@/domain/shared/occupancy";
import { StayRange } from "@/domain/shared/stay-range";

const searchBookingPage = vi.fn();
const bookingDate = LocalDate.parse("2026-11-26");

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));
vi.mock("@/composition/booking-search", () => ({
  getBookingSearchSetup: async () => ({
    bookable: true,
    today: bookingDate,
    phone: null,
    email: null,
  }),
  searchBookingPage,
}));
vi.mock("@/app/(marketing)/site-content", () => ({
  requireBranch: async () => ({
    id: "branch-id",
    slug: "new-cairo",
    name: "New Cairo",
    hero: null,
  }),
}));

const { default: BookingSearchPage } = await import(
  "@/app/(marketing)/[branch]/book/page"
);

async function renderSearch() {
  render(
    await BookingSearchPage({
      params: Promise.resolve({ branch: "new-cairo" }),
      searchParams: Promise.resolve({
        checkIn: "2026-12-03",
        checkOut: "2026-12-05",
        adults: "2",
        children: "0",
      }),
    }),
  );
}

afterEach(() => vi.restoreAllMocks());

it("renders the wait interval and keeps the search when the shared bucket is full", async () => {
  searchBookingPage.mockResolvedValueOnce(
    rateLimited("Too many searches.", 17),
  );
  await renderSearch();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Please wait 17 seconds, then search again.",
  );
  expect(screen.getByLabelText("Check-in")).toHaveValue("2026-12-03");
  expect(screen.getByLabelText("Check-out")).toHaveAttribute(
    "min",
    "2026-11-27",
  );
  expect(
    screen.getByRole("button", { name: "Check availability" }),
  ).toBeEnabled();
});

it("keeps the form usable on a search failure and excludes the driver's message from logs", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  searchBookingPage.mockRejectedValueOnce(
    Object.assign(new Error("Private criteria are in the driver message."), {
      name: "PrismaClientKnownRequestError",
      code: "P2024",
    }),
  );
  await renderSearch();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Please try your search again in a moment.",
  );
  expect(screen.getByLabelText("Check-out")).toHaveValue("2026-12-05");
  expect(log).toHaveBeenCalledExactlyOnceWith(
    "[booking-search] availability failed: PrismaClientKnownRequestError (code P2024)",
  );
});

it("explains unavailable listings using distinct price and guest count reasons", async () => {
  const listing = (
    slug: string,
    name: string,
    reason: "UNPRICED" | "OCCUPANCY",
  ) => ({
    available: false,
    unitsAvailable: 0,
    pricePerNight: [],
    accommodationTotal: null,
    reason,
    roomType: {
      slug,
      name,
      accommodationType: "ROOM" as const,
      shortDescription: "A room",
      featured: false,
      updatedAt: "2026-11-26",
      facts: {
        maxAdults: 1,
        maxChildren: 0,
        sizeSqm: null,
        bedSummary: null,
        viewSummary: null,
        bedroomCount: null,
        bathroomCount: null,
      },
      hero: null,
    },
  });
  searchBookingPage.mockResolvedValueOnce(
    success<PublicAvailability>({
      branchId: "branch-id",
      branchSlug: "new-cairo",
      stay: StayRange.create(
        LocalDate.parse("2026-12-03"),
        LocalDate.parse("2026-12-05"),
      ),
      occupancy: Occupancy.create({ adults: 2, children: 0 }),
      results: [
        listing("studio", "Studio", "UNPRICED"),
        listing("single", "Single", "OCCUPANCY"),
      ],
    }),
  );
  await renderSearch();
  const unavailable = within(
    screen.getByRole("region", { name: "Unavailable for this search" }),
  );
  expect(
    unavailable.getByText("Rates are unavailable for these dates."),
  ).toBeVisible();
  expect(
    unavailable.getByText("Does not fit the number of guests entered."),
  ).toBeVisible();
});
