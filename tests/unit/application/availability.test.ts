import { describe, expect, it } from "vitest";

import type { StaffPrincipal } from "@/application/auth/ports";
import {
  GetAvailabilityGrid,
  SearchAvailability,
  type AvailabilityBranch,
  type AvailabilityCatalog,
  type CatalogRoomType,
  type InventoryNightRecord,
  type InventoryReader,
} from "@/application/inventory";
import type { RateBatchReader, RateReadModel } from "@/application/pricing";
import { failure, success } from "@/application/shared/result";
import { LocalDate } from "@/domain/shared/local-date";
import { Money } from "@/domain/shared/money";
import { StayRange } from "@/domain/shared/stay-range";
import type { StaffRole } from "@/domain/shared/types";

const BRANCH = "branch-a";
const NOW = new Date("2027-03-01T10:00:00.000Z");
const date = (value: string) => LocalDate.parse(value);
const usd = (amountMinor: number) =>
  Money.create({ amountMinor, currency: "USD" });

function principal(
  role: StaffRole,
  branchIds: readonly string[] = [],
): StaffPrincipal {
  return {
    id: `staff-${role}`,
    name: role,
    email: `${role}@example.test`,
    role,
    sessionId: "session",
    branchIds,
  };
}

const roomType = (id: string, overrides: Partial<CatalogRoomType> = {}) => ({
  id,
  name: `Listing ${id}`,
  maxAdults: 2,
  maxChildren: 1,
  ...overrides,
});

type World = Readonly<{
  branch?: AvailabilityBranch | null;
  roomTypes?: readonly CatalogRoomType[];
  /** capacity, sold, blocked by `roomTypeId` and night; default 2, 0, 0. */
  counts?: (roomTypeId: string, night: string) => Partial<InventoryNightRecord>;
  rates?: Readonly<Record<string, RateReadModel>>;
}>;

function build(world: World = {}, now: Date = NOW) {
  const calls = {
    scopes: [] as string[],
    reads: [] as { roomTypeIds: readonly string[]; nights: number }[],
    rateReads: 0,
  };
  const catalog: AvailabilityCatalog = {
    findBranch: async () =>
      world.branch === undefined
        ? { id: BRANCH, timeZone: "Africa/Cairo", active: true }
        : world.branch,
    listRoomTypes: async (_branchId, scope) => {
      calls.scopes.push(scope);
      return world.roomTypes ?? [roomType("rt-1")];
    },
  };
  const reader: InventoryReader = {
    readNights: async ({ roomTypeIds, nights }) => {
      calls.reads.push({ roomTypeIds, nights: nights.length });
      return success(
        roomTypeIds.flatMap((id) =>
          nights.map(
            (night): InventoryNightRecord => ({
              roomTypeId: id,
              night,
              capacity: 2,
              sold: 0,
              blocked: 0,
              ...world.counts?.(id, night.value),
            }),
          ),
        ),
      );
    },
  };
  const rates: RateBatchReader = {
    readMany: async (ids) => {
      calls.rateReads += 1;
      return new Map(
        ids.map((id) => [
          id,
          world.rates?.[id] ?? {
            baseRate: { roomTypeId: id, amount: usd(10_000), updatedAt: NOW },
            periods: [],
          },
        ]),
      );
    },
  };
  return {
    calls,
    grid: new GetAvailabilityGrid({
      catalog,
      reader,
      checkpoints: { read: async () => null },
    }),
    search: new SearchAvailability({
      catalog,
      reader,
      rates,
      clock: { now: () => now },
    }),
  };
}

const WINDOW = { from: "2027-06-10", to: "2027-06-13" };
const STAY = {
  checkIn: "2027-06-10",
  checkOut: "2027-06-13",
  adults: 2,
  children: 0,
};

describe("GetAvailabilityGrid", () => {
  it("authorizes the branch before reading anything", async () => {
    const { grid, calls } = build();
    for (const staff of [
      null,
      principal("EDITOR", [BRANCH]),
      principal("RECEPTIONIST", ["branch-b"]),
    ]) {
      const result = await grid.execute(staff, BRANCH, WINDOW);
      expect(result.ok).toBe(false);
    }
    expect(calls.scopes).toEqual([]);
    expect(calls.reads).toEqual([]);
  });

  it("lets Admin, Manager, and Receptionist read their branch", async () => {
    const { grid } = build();
    for (const staff of [
      principal("ADMIN"),
      principal("MANAGER", [BRANCH]),
      principal("RECEPTIONIST", [BRANCH]),
    ]) {
      expect((await grid.execute(staff, BRANCH, WINDOW)).ok).toBe(true);
    }
  });

  it("rejects bad windows with 422 field errors", async () => {
    const { grid } = build();
    const admin = principal("ADMIN");
    for (const query of [
      { from: "2027-02-30", to: "2027-03-02" },
      { from: "2027-06-10", to: "2027-06-10" },
      { from: "2027-06-10", to: "2027-08-20" },
      { from: "2027-06-10" },
    ]) {
      const result = await grid.execute(admin, BRANCH, query);
      expect(!result.ok && result.error.code).toBe("VALIDATION");
    }
    const exactly62 = await grid.execute(admin, BRANCH, {
      from: "2027-06-10",
      to: "2027-08-11",
    });
    expect(exactly62.ok).toBe(true);
  });

  it("returns NOT_FOUND for a missing branch", async () => {
    const { grid } = build({ branch: null });
    const result = await grid.execute(principal("ADMIN"), BRANCH, WINDOW);
    expect(!result.ok && result.error.code).toBe("NOT_FOUND");
  });

  it("includes every status listing and every night, free = capacity - sold", async () => {
    const { grid, calls } = build({
      roomTypes: [roomType("rt-1"), roomType("rt-empty")],
      counts: (id, night) =>
        id === "rt-empty"
          ? { capacity: 0 }
          : night === "2027-06-11"
            ? { sold: 1, blocked: 1, capacity: 3 }
            : {},
    });
    const result = await grid.execute(principal("ADMIN"), BRANCH, WINDOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calls.scopes).toEqual(["ALL"]);
    expect(calls.reads).toEqual([
      { roomTypeIds: ["rt-1", "rt-empty"], nights: 3 },
    ]);
    const [first, empty] = result.value.roomTypes;
    expect(first?.nights.map((row) => row.night.value)).toEqual([
      "2027-06-10",
      "2027-06-11",
      "2027-06-12",
    ]);
    expect(first?.nights[1]).toMatchObject({
      capacity: 3,
      sold: 1,
      free: 2,
      blocked: 1,
    });
    expect(empty?.nights).toHaveLength(3);
    expect(
      empty?.nights.every((row) => row.capacity === 0 && row.free === 0),
    ).toBe(true);
    expect(result.value.lastSyncCheckpoint).toBeNull();
  });

  it("returns an empty list for a branch without listings", async () => {
    const { grid, calls } = build({ roomTypes: [] });
    const result = await grid.execute(principal("ADMIN"), BRANCH, WINDOW);
    expect(result.ok && result.value.roomTypes).toEqual([]);
    expect(calls.reads).toEqual([]);
  });

  it("treats sold above capacity as an integrity failure, not a number", async () => {
    const { grid } = build({ counts: () => ({ capacity: 1, sold: 2 }) });
    await expect(
      grid.execute(principal("ADMIN"), BRANCH, WINDOW),
    ).rejects.toThrow("oversold");
  });
});

describe("SearchAvailability", () => {
  it("is a 404 for a missing or inactive branch, before validating input", async () => {
    for (const branch of [
      null,
      { id: BRANCH, timeZone: "Africa/Cairo", active: false },
    ]) {
      const { search, calls } = build({ branch });
      const result = await search.execute(BRANCH, { nonsense: true });
      expect(!result.ok && result.error.code).toBe("NOT_FOUND");
      expect(calls.scopes).toEqual([]);
    }
  });

  it("validates dates, occupancy, quantity, and the public stay policy as 422", async () => {
    const { search } = build();
    const bad: unknown[] = [
      { ...STAY, checkIn: "2027-02-30" },
      { ...STAY, adults: 0 },
      { ...STAY, unitsRequested: 6 },
      { ...STAY, checkIn: "2027-02-28", checkOut: "2027-03-02" }, // past (Cairo today is 2027-03-01)
      { ...STAY, checkOut: "2027-07-20" }, // 40 nights
      { ...STAY, checkIn: "2029-01-01", checkOut: "2029-01-03" }, // beyond horizon
    ];
    for (const input of bad) {
      const result = await search.execute(BRANCH, input);
      expect(!result.ok && result.error.code).toBe("VALIDATION");
    }
  });

  it("derives today from the branch zone, not UTC", async () => {
    // 22:30 UTC on 2027-03-01 is already 2027-03-02 in Cairo (UTC+2).
    const { search: late } = build({}, new Date("2027-03-01T22:30:00.000Z"));
    const yesterday = await late.execute(BRANCH, {
      ...STAY,
      checkIn: "2027-03-01",
      checkOut: "2027-03-03",
    });
    expect(!yesterday.ok && yesterday.error.code).toBe("VALIDATION");
    const today = await late.execute(BRANCH, {
      ...STAY,
      checkIn: "2027-03-02",
      checkOut: "2027-03-03",
    });
    expect(today.ok).toBe(true);
  });

  it("returns an empty result for a branch with no published listings", async () => {
    const { search, calls } = build({ roomTypes: [] });
    const result = await search.execute(BRANCH, STAY);
    expect(result.ok && result.value.results).toEqual([]);
    expect(calls.scopes).toEqual(["PUBLISHED"]);
    expect(calls.reads).toEqual([]);
  });

  it("prices the worked example to $260.00 across two periods", async () => {
    const stay = StayRange.create(date("2027-09-10"), date("2027-09-14"));
    const { search } = build({
      rates: {
        "rt-1": {
          baseRate: null,
          periods: [
            {
              id: "p1",
              roomTypeId: "rt-1",
              branchId: BRANCH,
              range: StayRange.create(date("2027-09-10"), date("2027-09-12")),
              amount: usd(6000),
              active: true,
              label: null,
              createdAt: NOW,
              updatedAt: NOW,
            },
            {
              id: "p2",
              roomTypeId: "rt-1",
              branchId: BRANCH,
              range: StayRange.create(date("2027-09-12"), date("2027-09-20")),
              amount: usd(7000),
              active: true,
              label: null,
              createdAt: NOW,
              updatedAt: NOW,
            },
          ],
        },
      },
    });
    const result = await search.execute(BRANCH, {
      checkIn: stay.checkIn.value,
      checkOut: stay.checkOut.value,
      adults: 2,
      children: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [listing] = result.value.results;
    expect(listing?.pricePerNight.map((amount) => amount.amountMinor)).toEqual([
      6000, 6000, 7000, 7000,
    ]);
    expect(listing?.accommodationTotal?.amountMinor).toBe(26_000);
    expect(listing?.available).toBe(true);
    expect(listing?.reason).toBeUndefined();
  });

  it("multiplies the total by the quantity, even when sold out", async () => {
    const { search } = build({ counts: () => ({ capacity: 2 }) });
    const result = await search.execute(BRANCH, {
      ...STAY,
      unitsRequested: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [listing] = result.value.results;
    expect(listing).toMatchObject({
      available: false,
      unitsAvailable: 2,
      reason: "SOLD_OUT",
    });
    expect(listing?.accommodationTotal?.amountMinor).toBe(3 * 3 * 10_000);
  });

  it("caps the disclosed quantity at 5 and bounds it below by zero", async () => {
    const { search } = build({
      roomTypes: [roomType("big"), roomType("full")],
      counts: (id) =>
        id === "big" ? { capacity: 9 } : { capacity: 1, sold: 1 },
    });
    const result = await search.execute(BRANCH, STAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.results.map((r) => r.unitsAvailable)).toEqual([5, 0]);
    expect(result.value.results[1]?.reason).toBe("SOLD_OUT");
  });

  it("uses the scarcest night, and ignores oversold nights as zero", async () => {
    const { search } = build({
      counts: (_id, night) =>
        night === "2027-06-11" ? { capacity: 1 } : { capacity: 4 },
    });
    const result = await search.execute(BRANCH, STAY);
    expect(result.ok && result.value.results[0]?.unitsAvailable).toBe(1);

    const oversold = build({ counts: () => ({ capacity: 1, sold: 3 }) });
    const sold = await oversold.search.execute(BRANCH, STAY);
    expect(sold.ok && sold.value.results[0]?.unitsAvailable).toBe(0);
  });

  it("reports UNPRICED first, then OCCUPANCY, then SOLD_OUT", async () => {
    const full = { counts: () => ({ capacity: 0 }) };
    const priced = {
      baseRate: { roomTypeId: "x", amount: usd(5000), updatedAt: NOW },
      periods: [],
    };
    const { search } = build({
      ...full,
      roomTypes: [
        roomType("unpriced", { maxAdults: 1 }), // too small and unpriced and full
        roomType("small", { maxAdults: 1 }), // too small and full
        roomType("full"),
      ],
      rates: {
        unpriced: { baseRate: null, periods: [] },
        small: priced,
        full: priced,
      },
    });
    const result = await search.execute(BRANCH, STAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [unpriced, small, soldOut] = result.value.results;
    expect(unpriced).toMatchObject({
      reason: "UNPRICED",
      pricePerNight: [],
      accommodationTotal: null,
      available: false,
      unitsAvailable: 0,
    });
    expect(small).toMatchObject({ reason: "OCCUPANCY", unitsAvailable: 0 });
    expect(soldOut).toMatchObject({ reason: "SOLD_OUT" });
  });

  it("never returns a partial price array for one unpriced night", async () => {
    const { search } = build({
      rates: {
        "rt-1": {
          baseRate: null,
          periods: [
            {
              id: "p1",
              roomTypeId: "rt-1",
              branchId: BRANCH,
              range: StayRange.create(date("2027-06-10"), date("2027-06-12")),
              amount: usd(6000),
              active: true,
              label: null,
              createdAt: NOW,
              updatedAt: NOW,
            },
          ],
        },
      },
    });
    const result = await search.execute(BRANCH, STAY);
    expect(result.ok && result.value.results[0]).toMatchObject({
      reason: "UNPRICED",
      pricePerNight: [],
      accommodationTotal: null,
    });
  });

  it("checks occupancy per unit using adults and children", async () => {
    const { search } = build({
      roomTypes: [roomType("rt-1", { maxAdults: 2, maxChildren: 0 })],
    });
    const fits = await search.execute(BRANCH, STAY);
    const kids = await search.execute(BRANCH, { ...STAY, children: 1 });
    expect(fits.ok && fits.value.results[0]?.reason).toBeUndefined();
    expect(kids.ok && kids.value.results[0]?.reason).toBe("OCCUPANCY");
    // Free units never turn an occupancy refusal into a selectable quantity.
    expect(kids.ok && kids.value.results[0]).toMatchObject({
      available: false,
      unitsAvailable: 0,
      reason: "OCCUPANCY",
    });
  });

  it("discloses only allowlisted fields and reads each source once", async () => {
    const { search, calls } = build({
      roomTypes: [roomType("rt-1"), roomType("rt-2")],
    });
    const result = await search.execute(BRANCH, STAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const listing of result.value.results) {
      expect(Object.keys(listing).sort()).toEqual(
        [
          "accommodationTotal",
          "available",
          "name",
          "pricePerNight",
          "roomTypeId",
          "unitsAvailable",
        ].sort(),
      );
    }
    expect(calls.reads).toHaveLength(1);
    expect(calls.rateReads).toBe(1);
  });
});

describe("a listing deleted between the list and the read", () => {
  function racing(scope: "ALL" | "PUBLISHED") {
    let listCalls = 0;
    const catalog: AvailabilityCatalog = {
      findBranch: async () => ({
        id: BRANCH,
        timeZone: "Africa/Cairo",
        active: true,
      }),
      listRoomTypes: async () => {
        listCalls += 1;
        return listCalls === 1
          ? [roomType("rt-1"), roomType("gone")]
          : [roomType("rt-1")];
      },
    };
    const reader: InventoryReader = {
      readNights: async ({ roomTypeIds, nights }) =>
        roomTypeIds.includes("gone")
          ? failure("NOT_FOUND", "The requested listing was not found.")
          : success(
              roomTypeIds.flatMap((id) =>
                nights.map(
                  (night): InventoryNightRecord => ({
                    roomTypeId: id,
                    night,
                    capacity: 2,
                    sold: 0,
                    blocked: 0,
                  }),
                ),
              ),
            ),
    };
    const rates: RateBatchReader = {
      readMany: async (ids) =>
        new Map(
          ids.map((id) => [
            id,
            {
              baseRate: { roomTypeId: id, amount: usd(10_000), updatedAt: NOW },
              periods: [],
            },
          ]),
        ),
    };
    return {
      scope,
      grid: new GetAvailabilityGrid({
        catalog,
        reader,
        checkpoints: { read: async () => null },
      }),
      search: new SearchAvailability({
        catalog,
        reader,
        rates,
        clock: { now: () => NOW },
      }),
    };
  }

  it("drops the deleted listing from the grid instead of returning 404", async () => {
    const result = await racing("ALL").grid.execute(
      principal("ADMIN"),
      BRANCH,
      WINDOW,
    );
    expect(result.ok && result.value.roomTypes.map((room) => room.id)).toEqual([
      "rt-1",
    ]);
  });

  it("drops the deleted listing from a search too", async () => {
    const result = await racing("PUBLISHED").search.execute(BRANCH, STAY);
    expect(result.ok && result.value.results.map((r) => r.roomTypeId)).toEqual([
      "rt-1",
    ]);
  });
});
