import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { BookingSelection } from "@/presentation/features/booking/booking-selection";

const { search, requestQuote } = vi.hoisted(() => ({
  search: { value: "" },
  requestQuote: vi.fn(async () => ({
    ok: true as const,
    status: 200 as const,
    data: {
      available: true,
      bookable: true,
      unavailableLines: [],
      paymentMethods: [],
      quote: { accommodation: { amountMinor: 100, currency: "USD" } },
    },
  })),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search.value),
}));
vi.mock("@/presentation/api-client/quotes", () => ({ requestQuote }));

const stay = { checkIn: "2026-12-04", checkOut: "2026-12-06" };
const listing = (slug: string, unitsAvailable: number) => ({
  slug,
  name: slug,
  unitsAvailable,
  maxAdults: 2,
  maxChildren: 1,
});

function open(u: string | null, limit = 5) {
  search.value = u === null ? "" : new URLSearchParams({ u }).toString();
  render(
    <BookingSelection
      branchSlug="new-cairo"
      stay={stay}
      initialOccupancy={{ adults: 1, children: 0 }}
      limit={limit}
      listings={[listing("deluxe", 1), listing("studio", 4)]}
    >
      <p>results</p>
    </BookingSelection>,
  );
}
const units = () =>
  screen.queryAllByRole("group").map((group) => ({
    name: group.querySelector("legend")!.textContent,
    guests: [...group.querySelectorAll("select")].map(({ value }) => value),
  }));

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

it.each([null, "", "nonsense", "deluxe.2"])(
  "starts empty for the address value %j",
  (u) => {
    open(u);
    expect(units()).toEqual([]);
  },
);

it("rebuilds only what these results can still hold, within each limit", () => {
  open("deluxe.2.0,deluxe.2.0,gone.1.0,studio.9.9,studio.0.0,studio.1.1", 3);
  expect(units()).toEqual([
    { name: "deluxe · Unit 1", guests: ["2", "0"] },
    { name: "studio · Unit 2", guests: ["2", "1"] },
    { name: "studio · Unit 3", guests: ["1", "0"] },
  ]);
});

it("links to the details page and writes the selection into this address", async () => {
  vi.useFakeTimers();
  window.history.replaceState(
    null,
    "",
    "/new-cairo/book?checkIn=2026-12-04&notice=unavailable#search-feedback",
  );
  open("studio.2.1");
  await act(async () => vi.advanceTimersByTimeAsync(300));
  const next = screen.getByRole("link", { name: "Continue" });
  expect(next).toHaveAttribute(
    "href",
    "/new-cairo/book/details?checkIn=2026-12-04&checkOut=2026-12-06&u=studio.2.1",
  );
  next.addEventListener("click", (event) => event.preventDefault());
  fireEvent.click(next);
  expect(window.location.search).toBe("?checkIn=2026-12-04&u=studio.2.1");
  expect(window.location.hash).toBe("#search-feedback");
});
