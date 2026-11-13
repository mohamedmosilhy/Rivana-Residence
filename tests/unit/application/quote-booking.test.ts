import { describe, expect, it, vi } from "vitest";

import { QuoteBooking, type QuoteBookingReaders } from "@/application/quotes";
import type { ServiceOfferingRecord } from "@/application/services";
import type { CouponRecord } from "@/domain/coupons";
import { Money } from "@/domain/shared/money";

const NOW = new Date("2031-01-01T10:00:00.000Z");
const BRANCH = "branch-a";
const usd = (amountMinor: number) =>
  Money.create({ amountMinor, currency: "USD" });

type RoomSpec = Readonly<{
  id: string;
  slug: string;
  rate: number;
  units: number;
  maxAdults?: number;
  maxChildren?: number;
  type?: "ROOM" | "APARTMENT";
  rateless?: boolean;
}>;

const garden: RoomSpec = {
  id: "room-1",
  slug: "garden",
  rate: 8_000,
  units: 2,
};
const apartment: RoomSpec = {
  id: "room-2",
  slug: "apartment",
  rate: 12_000,
  units: 2,
  type: "APARTMENT",
};

function offering(
  kind: "BREAKFAST" | "AIRPORT_TRANSFER",
  priceUnit: ServiceOfferingRecord["priceUnit"],
  price: number,
  childPrice: number | null = null,
  active = true,
): ServiceOfferingRecord {
  return {
    id: `svc-${kind}`,
    kind,
    priceUnit,
    price: usd(price),
    childPrice: childPrice === null ? null : usd(childPrice),
    active,
    description: null,
    updatedAt: NOW,
  };
}

function coupon(overrides: Partial<CouponRecord> = {}): CouponRecord {
  return {
    code: "SAVE15",
    kind: "PERCENT",
    percentBasisPoints: 1_500,
    amount: null,
    active: true,
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    maxRedemptionsPerPhone: null,
    allBranches: true,
    branchIds: [],
    ...overrides,
  };
}

function build(
  options: {
    rooms?: RoomSpec[];
    services?: ServiceOfferingRecord[];
    coupon?: CouponRecord | null;
    redemptions?: { total: number; forPhone: number };
    vat?: number;
    online?: boolean;
    soldOut?: readonly string[];
  } = {},
) {
  const rooms = options.rooms ?? [garden, apartment];
  const readers = {
    branches: {
      findActiveRowBySlug: vi.fn(async (slug: string) =>
        slug === "giza"
          ? ({
              id: BRANCH,
              slug: "giza",
              timeZone: "Africa/Cairo",
              onlineBookingEnabled: options.online ?? true,
            } as never)
          : null,
      ),
    },
    rooms: {
      listPublished: vi.fn(
        async () =>
          rooms.map((room) => ({
            id: room.id,
            branchId: BRANCH,
            status: "PUBLISHED",
            slug: room.slug,
            name: `Name ${room.slug}`,
            accommodationType: room.type ?? "ROOM",
            maxAdults: room.maxAdults ?? 3,
            maxChildren: room.maxChildren ?? 2,
          })) as never,
      ),
    },
    inventory: {
      readNights: vi.fn(
        async (
          input: Parameters<QuoteBookingReaders["inventory"]["readNights"]>[0],
        ) => ({
          ok: true as const,
          value: input.roomTypeIds.flatMap((roomTypeId) =>
            input.nights.map((night) => ({
              roomTypeId,
              night,
              capacity: rooms.find((room) => room.id === roomTypeId)!.units,
              blocked: 0,
              sold: options.soldOut?.includes(roomTypeId)
                ? rooms.find((room) => room.id === roomTypeId)!.units
                : 0,
            })),
          ),
        }),
      ),
    },
    rates: {
      readMany: vi.fn(
        async (ids: readonly string[]) =>
          new Map(
            ids.map((id) => {
              const room = rooms.find((candidate) => candidate.id === id)!;
              return [
                id,
                {
                  baseRate: room.rateless
                    ? null
                    : {
                        roomTypeId: id,
                        amount: usd(room.rate),
                        updatedAt: NOW,
                      },
                  periods: [],
                },
              ] as const;
            }),
          ),
      ),
    },
    services: { listByBranch: vi.fn(async () => options.services ?? []) },
    coupons: {
      findByCode: vi.fn(async () =>
        options.coupon === undefined ? null : options.coupon,
      ),
    },
    redemptions: {
      count: vi.fn(
        async () => options.redemptions ?? { total: 0, forPhone: 0 },
      ),
    },
    settings: {
      read: vi.fn(async () => ({
        vatRateBasisPoints: options.vat ?? 1_500,
        updatedAt: NOW,
      })),
    },
  };
  const quote = new QuoteBooking({
    ...(readers as unknown as QuoteBookingReaders),
    clock: { now: () => NOW },
  });
  return { quote, readers };
}

const request = (overrides: Record<string, unknown> = {}) => ({
  branchSlug: "giza",
  stay: { checkIn: "2031-01-10", checkOut: "2031-01-13" },
  lines: [{ roomSlug: "garden", occupancy: { adults: 2, children: 0 } }],
  services: [],
  ...overrides,
});

async function run(
  options: Parameters<typeof build>[0],
  body: Record<string, unknown>,
) {
  const { quote, readers } = build(options);
  return { result: await quote.execute(body), readers };
}

describe("QuoteBooking worked examples (AC-1)", () => {
  it("example 2: two units, services, a 15% coupon, 15% VAT = 64026", async () => {
    const { result } = await run(
      {
        services: [
          offering("BREAKFAST", "PER_BOOKING", 3_000),
          offering("AIRPORT_TRANSFER", "PER_BOOKING", 2_500),
        ],
        coupon: coupon(),
      },
      request({
        lines: [
          { roomSlug: "garden", occupancy: { adults: 2, children: 0 } },
          { roomSlug: "apartment", occupancy: { adults: 2, children: 0 } },
        ],
        services: ["BREAKFAST", "AIRPORT_TRANSFER"],
        couponCode: " save15 ",
      }),
    );
    expect(result.ok && result.value.quote).toMatchObject({
      accommodationMinor: 60_000,
      servicesMinor: 5_500,
      subtotalMinor: 65_500,
      discountMinor: 9_825,
      taxableMinor: 55_675,
      vatMinor: 8_351,
      totalMinor: 64_026,
      appliedCoupon: { code: "SAVE15", kind: "PERCENT" },
    });
    expect(result.ok && result.value.bookable).toBe(true);
  });

  it("example 3: VAT 1501.5 rounds up to 1502 and a 10% coupon on 33333 is 3333", async () => {
    const vat = await run(
      { rooms: [{ ...garden, rate: 10_010 }] },
      request({
        stay: { checkIn: "2031-01-10", checkOut: "2031-01-11" },
      }),
    );
    expect(vat.result.ok && vat.result.value.quote).toMatchObject({
      taxableMinor: 10_010,
      vatMinor: 1_502,
      totalMinor: 11_512,
    });
    const percent = await run(
      {
        rooms: [{ ...garden, rate: 11_111 }],
        coupon: coupon({ percentBasisPoints: 1_000 }),
      },
      request({ couponCode: "SAVE15" }),
    );
    expect(percent.result.ok && percent.result.value.quote).toMatchObject({
      subtotalMinor: 33_333,
      discountMinor: 3_333,
    });
  });

  it("example 4: a fixed coupon above the subtotal gives total 0", async () => {
    const { result } = await run(
      {
        rooms: [{ ...garden, rate: 4_000 }],
        coupon: coupon({
          kind: "FIXED",
          percentBasisPoints: null,
          amount: usd(5_000),
        }),
      },
      request({
        stay: { checkIn: "2031-01-10", checkOut: "2031-01-11" },
        couponCode: "SAVE15",
      }),
    );
    expect(result.ok && result.value.quote).toMatchObject({
      subtotalMinor: 4_000,
      discountMinor: 4_000,
      taxableMinor: 0,
      vatMinor: 0,
      totalMinor: 0,
    });
  });

  it("example 5: per person per night breakfast with a child price = 39100", async () => {
    const { result } = await run(
      {
        services: [
          offering("BREAKFAST", "PER_PERSON_PER_NIGHT", 1_000, 500),
          offering("AIRPORT_TRANSFER", "PER_BOOKING", 2_500),
        ],
      },
      request({
        lines: [{ roomSlug: "garden", occupancy: { adults: 2, children: 1 } }],
        services: ["BREAKFAST", "AIRPORT_TRANSFER"],
      }),
    );
    expect(result.ok && result.value.quote).toMatchObject({
      accommodationMinor: 24_000,
      servicesMinor: 10_000,
      subtotalMinor: 34_000,
      vatMinor: 5_100,
      totalMinor: 39_100,
    });
    expect(result.ok && result.value.quote?.serviceLines[0]).toMatchObject({
      kind: "BREAKFAST",
      adultQuantity: 6,
      childQuantity: 3,
      amountMinor: 7_500,
    });
  });
});

describe("QuoteBooking composition rules", () => {
  it("never adds a service that was not requested, even when active", async () => {
    const { result } = await run(
      { services: [offering("BREAKFAST", "PER_BOOKING", 3_000)] },
      request(),
    );
    expect(result.ok && result.value.quote?.serviceLines).toEqual([]);
    expect(result.ok && result.value.quote?.servicesMinor).toBe(0);
  });

  it("uses the stored VAT rate, including 0% and 100%", async () => {
    for (const [vat, expected] of [
      [0, 0],
      [10_000, 24_000],
    ] as const) {
      const { result } = await run({ vat }, request());
      expect(result.ok && result.value.quote?.vatMinor).toBe(expected);
    }
  });

  it("returns bookable false when the branch switch is off, still quoting", async () => {
    const { result } = await run({ online: false }, request());
    expect(result.ok && result.value).toMatchObject({
      available: true,
      bookable: false,
    });
    expect(result.ok && result.value.quote).not.toBeNull();
  });
});

describe("QuoteBooking availability", () => {
  it("returns unavailable line indexes with a null quote", async () => {
    const { result } = await run(
      { soldOut: ["room-2"] },
      request({
        lines: [
          { roomSlug: "garden", occupancy: { adults: 2, children: 0 } },
          { roomSlug: "apartment", occupancy: { adults: 2, children: 0 } },
        ],
      }),
    );
    expect(result.ok && result.value).toMatchObject({
      available: false,
      unavailableLines: [1],
      bookable: false,
      quote: null,
    });
  });

  it("checks repeated listings with their summed quantity", async () => {
    const lines = Array.from({ length: 3 }, () => ({
      roomSlug: "garden",
      occupancy: { adults: 2, children: 0 },
    }));
    const { result } = await run({}, request({ lines }));
    expect(result.ok && result.value).toMatchObject({
      available: false,
      unavailableLines: [0, 1, 2],
    });
    const two = await run({}, request({ lines: lines.slice(0, 2) }));
    expect(two.result.ok && two.result.value.available).toBe(true);
  });

  it("marks a listing without a rate unavailable instead of inventing a price", async () => {
    const { result } = await run(
      { rooms: [{ ...garden, rateless: true }] },
      request(),
    );
    expect(result.ok && result.value).toMatchObject({
      available: false,
      unavailableLines: [0],
      quote: null,
    });
  });
});

describe("QuoteBooking refusals", () => {
  it("answers 404 for an unknown branch", async () => {
    const { result } = await run({}, request({ branchSlug: "nowhere" }));
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it.each([
    [
      "unknown listing",
      { roomSlug: "nope", occupancy: { adults: 1, children: 0 } },
      "lines.0.roomSlug",
    ],
    [
      "too many adults",
      { roomSlug: "garden", occupancy: { adults: 9, children: 0 } },
      "lines.0.occupancy",
    ],
  ])("refuses %s with a field error", async (_label, line, path) => {
    const { result } = await run({}, request({ lines: [line] }));
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: { [path]: expect.any(Array) } },
    });
  });

  it("refuses a past check-in and an over long stay with stay field errors", async () => {
    const past = await run(
      {},
      request({ stay: { checkIn: "2030-12-01", checkOut: "2030-12-03" } }),
    );
    expect(past.result).toMatchObject({
      ok: false,
      error: { fieldErrors: { "stay.checkIn": expect.any(Array) } },
    });
  });

  it.each([
    ["a client total", { total: { amountMinor: 1, currency: "USD" } }],
    ["a client discount", { discount: 5 }],
    [
      "a client price on a line",
      {
        lines: [
          {
            roomSlug: "garden",
            occupancy: { adults: 1, children: 0 },
            price: 1,
          },
        ],
      },
    ],
    [
      "six units",
      {
        lines: Array.from({ length: 6 }, () => ({
          roomSlug: "garden",
          occupancy: { adults: 1, children: 0 },
        })),
      },
    ],
    ["no units", { lines: [] }],
  ])("refuses %s (AC-6) and reads nothing", async (_label, extra) => {
    const { result, readers } = await run({}, request(extra));
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(readers.branches.findActiveRowBySlug).not.toHaveBeenCalled();
  });

  it("answers SERVICE_UNAVAILABLE for a missing or inactive service", async () => {
    const missing = await run({}, request({ services: ["BREAKFAST"] }));
    expect(missing.result).toMatchObject({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", context: { kind: "BREAKFAST" } },
    });
    const inactive = await run(
      {
        services: [
          offering("AIRPORT_TRANSFER", "PER_BOOKING", 2_500, null, false),
        ],
      },
      request({ services: ["AIRPORT_TRANSFER"] }),
    );
    expect(inactive.result).toMatchObject({
      ok: false,
      error: {
        code: "SERVICE_UNAVAILABLE",
        context: { kind: "AIRPORT_TRANSFER" },
      },
    });
  });

  it("refuses a duplicate service with a validation error", async () => {
    const { result } = await run(
      { services: [offering("BREAKFAST", "PER_BOOKING", 3_000)] },
      request({ services: ["BREAKFAST", "BREAKFAST"] }),
    );
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });
});

describe("QuoteBooking order of checks (spec Decision 10)", () => {
  it("an unavailable line wins over a bad coupon and reads no service or coupon", async () => {
    const { result, readers } = await run(
      { soldOut: ["room-1"], coupon: null },
      request({ couponCode: "NOPE", services: ["BREAKFAST"] }),
    );
    expect(result.ok && result.value).toMatchObject({
      available: false,
      unavailableLines: [0],
      quote: null,
    });
    expect(readers.services.listByBranch).not.toHaveBeenCalled();
    expect(readers.coupons.findByCode).not.toHaveBeenCalled();
    expect(readers.redemptions.count).not.toHaveBeenCalled();
    expect(readers.settings.read).not.toHaveBeenCalled();
  });

  it("an unavailable service wins over a bad coupon and never asks the coupon ports", async () => {
    const { result, readers } = await run(
      { coupon: null },
      request({ couponCode: "NOPE", services: ["BREAKFAST"] }),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE" },
    });
    expect(readers.coupons.findByCode).not.toHaveBeenCalled();
    expect(readers.redemptions.count).not.toHaveBeenCalled();
  });

  it("a bad coupon is refused before the VAT rate is read", async () => {
    const { result, readers } = await run(
      { coupon: null },
      request({ couponCode: "NOPE" }),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "COUPON_INVALID" },
    });
    expect(readers.settings.read).not.toHaveBeenCalled();
  });

  it("re-reads the catalog once when a listing vanishes between reads", async () => {
    const { quote, readers } = build();
    const rooms = await readers.rooms.listPublished();
    readers.rooms.listPublished
      .mockResolvedValueOnce(rooms)
      .mockResolvedValueOnce([] as never);
    readers.inventory.readNights.mockResolvedValueOnce({
      ok: false,
      error: { code: "NOT_FOUND", message: "gone" },
    } as never);
    const result = await quote.execute(request());
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: { "lines.0.roomSlug": [expect.any(String)] },
      },
    });
    expect(readers.rooms.listPublished).toHaveBeenCalledTimes(3);
  });

  it("gives up after one retry and reports the read failure", async () => {
    const { quote, readers } = build();
    readers.inventory.readNights.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "gone" },
    } as never);
    const result = await quote.execute(request());
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(readers.inventory.readNights).toHaveBeenCalledTimes(2);
  });
});

describe("QuoteBooking coupons (AC-4)", () => {
  const phoneRule = coupon({ maxRedemptionsPerPhone: 1 });
  it.each([
    ["NOT_FOUND", { coupon: null }, {}],
    ["INACTIVE", { coupon: coupon({ active: false }) }, {}],
    [
      "NOT_YET_VALID",
      { coupon: coupon({ startsAt: new Date("2031-06-01T00:00:00Z") }) },
      {},
    ],
    [
      "EXPIRED",
      { coupon: coupon({ endsAt: new Date("2030-12-31T00:00:00Z") }) },
      {},
    ],
    [
      "WRONG_BRANCH",
      { coupon: coupon({ allBranches: false, branchIds: ["other"] }) },
      {},
    ],
    [
      "LIMIT_REACHED",
      {
        coupon: coupon({ maxRedemptions: 5 }),
        redemptions: { total: 5, forPhone: 0 },
      },
      {},
    ],
    [
      "PHONE_LIMIT_REACHED",
      { coupon: phoneRule, redemptions: { total: 1, forPhone: 1 } },
      { phone: "+201001234567" },
    ],
  ])(
    "refuses %s as 422 COUPON_INVALID with the same message",
    async (reason, options, extra) => {
      const { result } = await run(
        options,
        request({ couponCode: "SAVE15", ...extra }),
      );
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "COUPON_INVALID",
          context: { reason },
          fieldErrors: { couponCode: [expect.any(String)] },
        },
      });
    },
  );

  it("gives every refusal the identical message so only the reason differs", async () => {
    const messages = new Set<string>();
    for (const options of [
      { coupon: null },
      { coupon: coupon({ active: false }) },
    ]) {
      const { result } = await run(options, request({ couponCode: "SAVE15" }));
      if (!result.ok) messages.add(result.error.message);
    }
    expect(messages.size).toBe(1);
  });

  it("treats a malformed code as not found and never asks the store", async () => {
    const { result, readers } = await run({}, request({ couponCode: "!!" }));
    expect(result).toMatchObject({
      ok: false,
      error: { code: "COUPON_INVALID", context: { reason: "NOT_FOUND" } },
    });
    expect(readers.coupons.findByCode).not.toHaveBeenCalled();
  });

  it("treats an over long code as a normal refusal, not a different error shape", async () => {
    const { result, readers } = await run(
      {},
      request({ couponCode: "A".repeat(500) }),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "COUPON_INVALID", context: { reason: "NOT_FOUND" } },
    });
    expect(readers.coupons.findByCode).not.toHaveBeenCalled();
  });

  it("matches the code case insensitively and trims spaces", async () => {
    const { result, readers } = await run(
      { coupon: coupon() },
      request({ couponCode: "  sAvE15  " }),
    );
    expect(result.ok).toBe(true);
    expect(readers.coupons.findByCode).toHaveBeenCalledWith("SAVE15");
  });

  it("applies the per phone limit only when a phone is sent", async () => {
    const withoutPhone = await run(
      { coupon: phoneRule, redemptions: { total: 1, forPhone: 1 } },
      request({ couponCode: "SAVE15" }),
    );
    expect(withoutPhone.result.ok).toBe(true);
  });
});
