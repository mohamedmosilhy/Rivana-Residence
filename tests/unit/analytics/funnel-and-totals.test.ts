import { describe, expect, it } from "vitest";

import { WebsiteReservationRequest } from "@/contracts/api/v1/reservations";
import {
  bookingSavedSteps,
  dailyTotals,
  parseSessionId,
  quoteSteps,
  refusalSteps,
  searchSteps,
  storedWithoutSession,
  summarizeSiteSessions,
  verificationSteps,
  type TotalledEvent,
} from "@/domain/analytics";

const branchId = "branch-a";
const stay = { checkIn: "2031-04-10", checkOut: "2031-04-13" };

describe("T-ANL-7: the steps each booking outcome produces", () => {
  it("marks a search with nothing available, and keeps only that one without a visit", () => {
    const found = searchSteps({
      branchId,
      stay,
      results: [{ available: false }, { available: true }],
    });
    expect(found).toEqual([{ name: "SEARCH", branchId }]);
    const none = searchSteps({
      branchId,
      stay,
      results: [{ available: false }],
    });
    expect(none).toEqual([
      { name: "SEARCH", branchId, outcome: "NO_AVAILABILITY", stay },
    ]);
    expect(searchSteps({ branchId, stay, results: [] })[0]?.outcome).toBe(
      "NO_AVAILABILITY",
    );
    expect(found.map(storedWithoutSession)).toEqual([false]);
    expect(none.map(storedWithoutSession)).toEqual([true]);
  });

  it("records one quote and one confirmation per distinct listing", () => {
    expect(
      quoteSteps(branchId, [
        { roomTypeId: "one" },
        { roomTypeId: "two" },
        { roomTypeId: "one" },
      ]),
    ).toEqual([
      { name: "QUOTE", branchId, roomId: "one" },
      { name: "QUOTE", branchId, roomId: "two" },
    ]);
    const booking = { branchId, roomTypeIds: ["one", "one"] };
    expect(bookingSavedSteps({ ...booking, confirmed: false })).toEqual([
      { name: "BOOKING_SUBMITTED", branchId },
    ]);
    expect(bookingSavedSteps({ ...booking, confirmed: true })).toEqual([
      { name: "BOOKING_SUBMITTED", branchId },
      { name: "BOOKING_CONFIRMED", branchId, roomId: "one" },
    ]);
  });

  it("counts booking codes only, and only the two named refusals", () => {
    expect(verificationSteps("CODE_REQUESTED", "BOOKING")).toEqual([
      { name: "CODE_REQUESTED" },
    ]);
    for (const purpose of ["GUEST_SESSION", undefined, null])
      expect(verificationSteps("PHONE_VERIFIED", purpose)).toEqual([]);
    for (const code of ["PRICE_CHANGED", "INVENTORY_UNAVAILABLE"])
      expect(refusalSteps("new-cairo", code)).toEqual([
        {
          name: "CHECKOUT_REFUSED",
          branchSlug: "new-cairo",
          outcome: code,
        },
      ]);
    expect(refusalSteps("new-cairo", "PHONE_NOT_VERIFIED")).toEqual([]);
  });

  it("takes 32 lowercase hex characters as a visit id and ignores anything else", () => {
    expect(parseSessionId("0a".repeat(16))).toBe("0a".repeat(16));
    for (const value of [
      "A".repeat(32),
      "a".repeat(31),
      "a".repeat(33),
      "g".repeat(32),
      "a".repeat(32) + "\n",
      42,
      null,
      undefined,
      {},
    ])
      expect(parseSessionId(value)).toBeNull();
  });

  it("never rejects a booking body because of the visit id", () => {
    const body = {
      branchSlug: "new-cairo",
      stay,
      lines: [{ roomSlug: "garden", occupancy: { adults: 2, children: 0 } }],
      services: [],
      guest: { fullName: "A", email: "a@b.c", phone: "+12025550101" },
      phoneVerificationToken: "t".repeat(43),
      paymentMethod: "ONLINE",
      expectedTotal: { amountMinor: 1, currency: "USD" },
      consent: { privacyNoticeVersion: "v1" },
    };
    for (const analyticsSessionId of [
      undefined,
      null,
      7,
      "x".repeat(500),
      { nested: true },
    ])
      expect(
        WebsiteReservationRequest.safeParse({ ...body, analyticsSessionId })
          .success,
      ).toBe(true);
    expect(
      WebsiteReservationRequest.safeParse({ ...body, sessionId: "x" }).success,
    ).toBe(false);
  });
});

const day = "2031-03-01";
let id = 0n;
function event(
  time: string,
  values: Partial<TotalledEvent> & Pick<TotalledEvent, "name">,
): TotalledEvent {
  id += 1n;
  return {
    id,
    occurredAt: new Date(time.includes("T") ? time : `${day}T${time}:00Z`),
    sessionId: "visit",
    visitorHash: "hash-1",
    path: null,
    funnelStep: null,
    branchId: null,
    roomId: null,
    referrerHost: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    device: null,
    outcome: null,
    stayCheckIn: null,
    stayCheckOut: null,
    ...values,
  };
}
const page = (
  time: string,
  path: string,
  values: Partial<TotalledEvent> = {},
) => event(time, { name: "PAGE_VIEW", path, funnelStep: 1, ...values });

function totals(events: TotalledEvent[], of = day) {
  const rows = dailyTotals(of, events);
  return (branch: string, dimension: string, key = "") => {
    const row = rows.find(
      (candidate) =>
        candidate.branchId === branch &&
        candidate.dimension === dimension &&
        candidate.key === key,
    );
    return row ? [row.visitors, row.sessions, row.count] : null;
  };
}

describe("T-ANL-9: daily totals", () => {
  it("counts one whole site visit once across two branches and gives each branch its own pages", () => {
    const read = totals([
      page("09:00", "/", {
        referrerHost: "www.google.com",
        utmSource: "google",
        device: "MOBILE",
      }),
      page("09:01", "/{branch}", { branchId: "a" }),
      page("09:02", "/{branch}/stay/[slug]", {
        branchId: "a",
        roomId: "room-a",
        funnelStep: 2,
      }),
      page("09:03", "/{branch}", { branchId: "b" }),
      event("09:04", {
        name: "QUOTE",
        funnelStep: 4,
        branchId: "b",
        roomId: "room-b",
      }),
      event("09:05", { name: "CODE_REQUESTED", funnelStep: 5 }),
    ]);
    expect(read("*", "TOTAL")).toEqual([1, 1, 4]);
    expect(read("a", "TOTAL")).toEqual([1, 1, 2]);
    expect(read("b", "TOTAL")).toEqual([1, 1, 1]);
    expect(read("", "TOTAL")).toEqual([1, 1, 1]);
    // The code step has no branch: it follows the branch the visit was last on.
    expect(read("b", "FUNNEL_STEP", "5")).toEqual([1, 1, 1]);
    expect(read("a", "FUNNEL_STEP", "5")).toBeNull();
    expect(read("", "FUNNEL_STEP", "5")).toBeNull();
    expect(read("*", "DROP_OFF", "5")).toEqual([1, 1, 1]);
    expect(read("a", "DROP_OFF", "2")).toEqual([1, 1, 1]);
    expect(read("*", "VERIFY_ABANDONED")).toEqual([1, 1, 1]);
    expect(read("b", "VERIFY_ABANDONED")).toEqual([1, 1, 1]);
    expect(read("*", "LANDING_PAGE", "/")).toEqual([1, 1, 1]);
    expect(read("a", "LANDING_PAGE", "/{branch}")).toEqual([1, 1, 1]);
    expect(read("*", "EXIT_PAGE", "/{branch}")).toEqual([1, 1, 1]);
    expect(read("a", "EXIT_PAGE", "/{branch}/stay/[slug]")).toEqual([1, 1, 1]);
    // Where the visit came from follows it into every branch it saw.
    for (const scope of ["*", "a", "b"]) {
      expect(read(scope, "REFERRER", "www.google.com")).toEqual([1, 1, 1]);
      expect(read(scope, "UTM_SOURCE", "google")).toEqual([1, 1, 1]);
      expect(read(scope, "DEVICE", "MOBILE")).toEqual([1, 1, 1]);
    }
    expect(read("a", "LISTING_VIEW", "room-a")).toEqual([1, 1, 1]);
    expect(read("b", "LISTING_QUOTE", "room-b")).toEqual([1, 1, 1]);
  });

  it("splits visits at thirty minutes, counts visitors by hash, and finishes no booked visit as a drop off", () => {
    const read = totals([
      page("09:00", "/{branch}", { branchId: "a" }),
      page("09:29", "/{branch}/about", { branchId: "a" }),
      page("09:59", "/{branch}/contact", { branchId: "a" }),
      page("10:00", "/{branch}", {
        branchId: "a",
        sessionId: "other",
        visitorHash: "hash-2",
      }),
      event("10:01", {
        name: "BOOKING_CONFIRMED",
        funnelStep: 8,
        sessionId: "other",
        visitorHash: null,
        branchId: "a",
        roomId: "room-a",
      }),
    ]);
    expect(read("*", "TOTAL")).toEqual([2, 3, 4]);
    expect(read("*", "FUNNEL_STEP", "8")).toEqual([1, 1, 1]);
    expect(read("*", "DROP_OFF", "8")).toBeNull();
    expect(read("*", "DROP_OFF", "1")).toEqual([1, 2, 2]);
    expect(read("*", "EXIT_PAGE", "/{branch}")).toBeNull();
    expect(read("a", "LISTING_BOOKING", "room-a")).toEqual([1, 1, 1]);
  });

  it("joins a late confirmation to its visit without keeping the visit open", () => {
    const events = [
      page("09:00", "/{branch}", { branchId: "a" }),
      event("09:50", {
        name: "BOOKING_CONFIRMED",
        funnelStep: 8,
        visitorHash: null,
        branchId: "a",
      }),
      page("10:00", "/{branch}", { branchId: "a" }),
    ];
    expect(
      summarizeSiteSessions(events).map((visit) => visit.reachedSteps),
    ).toEqual([[1, 8], [1]]);
    expect(totals(events)("*", "TOTAL")).toEqual([1, 2, 2]);
  });

  it("counts a visit that crosses midnight once, on the day it started, with that day's visitor", () => {
    const events = [
      page("2031-03-01T23:50:00Z", "/{branch}", { branchId: "a" }),
      page("2031-03-02T00:05:00Z", "/{branch}/about", {
        branchId: "a",
        visitorHash: "hash-next-day",
      }),
      event("2031-03-02T00:10:00Z", {
        name: "BOOKING_CONFIRMED",
        funnelStep: 8,
        visitorHash: null,
        branchId: "a",
      }),
    ];
    const first = totals(events, "2031-03-01");
    expect(first("*", "TOTAL")).toEqual([1, 1, 2]);
    expect(first("*", "FUNNEL_STEP", "8")).toEqual([1, 1, 1]);
    expect(dailyTotals("2031-03-02", events)).toEqual([
      {
        branchId: "*",
        dimension: "TOTAL",
        key: "",
        visitors: 0,
        sessions: 0,
        count: 0,
      },
    ]);
  });

  it("counts unmet demand per night, capped, and refusals by reason, with and without a visit", () => {
    const search = (sessionId: string | null, checkOut: string) =>
      event("11:00", {
        name: "SEARCH",
        sessionId,
        visitorHash: null,
        branchId: "a",
        outcome: "NO_AVAILABILITY",
        stayCheckIn: "2031-04-01",
        stayCheckOut: checkOut,
      });
    const refused = (time: string) =>
      event(time, {
        name: "CHECKOUT_REFUSED",
        branchId: "a",
        outcome: "PRICE_CHANGED",
      });
    const events = [
      search(null, "2031-04-03"),
      search("visit", "2031-06-30"),
      refused("11:01"),
      refused("11:02"),
    ];
    const read = totals(events);
    for (const scope of ["*", "a"]) {
      expect(read(scope, "UNMET_DATE", "2031-04-01")).toEqual([0, 1, 2]);
      expect(read(scope, "UNMET_DATE", "2031-04-02")).toEqual([0, 1, 2]);
      expect(read(scope, "UNMET_DATE", "2031-04-30")).toEqual([0, 1, 1]);
      expect(read(scope, "UNMET_DATE", "2031-05-01")).toBeNull();
      expect(read(scope, "REFUSAL", "PRICE_CHANGED")).toEqual([1, 1, 2]);
    }
    // A search without a visit is demand only, never a visit.
    expect(totals([search(null, "2031-04-03")])("*", "TOTAL")).toEqual([
      0, 0, 0,
    ]);
  });
});
