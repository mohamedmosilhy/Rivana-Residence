import { PrismaReservationRepository } from "@/infrastructure/db/prisma/repositories/reservations/reservation-repository";
import { range, reservationInput } from "./support/reservation-repositories";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { QuoteResponse } from "@/contracts/api/v1/quotes";
import { HmacThrottleKeys } from "@/infrastructure/auth/throttle-keys";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaPublicRateLimitStore } from "@/infrastructure/db/prisma/repositories/public-rate-limit-store";

import {
  createActor,
  createBranch,
  createRoom,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";

vi.mock("next/cache", () => ({
  unstable_cache: () => () => {
    throw new Error("P6 must not use the marketing cache.");
  },
  updateTag: () => undefined,
  revalidateTag: () => undefined,
}));
vi.mock("next/server", async (original) => ({
  ...(await original<object>()),
  connection: async () => undefined,
}));
vi.mock("@/composition/auth", () => ({
  resolveStaffFromHeaders: async () => null,
  throttleKeys: () => new HmacThrottleKeys("test-p6-hmac-secret"),
}));
const { POST } = await import("@/app/api/v1/quotes/route");

const client = createTestClient();
const NOW = new Date("2031-03-01T10:00:00Z");
const OTHER = "p6-other-branch-000000000000";
const date = (value: string) => new Date(`${value}T00:00:00Z`);
const usd = (amountMinor: number) => ({ amountMinor, currency: "USD" });

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/v1/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const quoteRequest = (overrides: Record<string, unknown> = {}) => ({
  branchSlug: "new-cairo",
  stay: { checkIn: "2031-04-10", checkOut: "2031-04-13" },
  lines: [{ roomSlug: "garden", occupancy: { adults: 2, children: 0 } }],
  services: [],
  ...overrides,
});
const ok = async (body: unknown) => {
  const response = await post(body);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return QuoteResponse.parse(await response.json());
};

let sequence = 0;
async function listing(
  slug: string,
  rate: number | null,
  options: Readonly<{
    units?: number;
    branchId?: string;
    type?: "ROOM" | "APARTMENT";
  }> = {},
) {
  const branchId = options.branchId ?? TEST_BRANCH_ID;
  const room = await createRoom(client, {
    status: "PUBLISHED",
    slug,
    branchId,
  });
  await client.room.update({
    where: { id: room.id },
    data: {
      maxAdults: 3,
      maxChildren: 2,
      ...(options.type ? { accommodationType: options.type } : {}),
    },
  });
  for (let index = 0; index < (options.units ?? 2); index += 1) {
    sequence += 1;
    await client.physicalRoom.create({
      data: {
        id: `p6-unit-${sequence}`,
        branchId,
        roomTypeId: room.id,
        label: `p6-unit-${sequence}`,
      },
    });
  }
  if (rate !== null) {
    await client.roomBaseRate.create({
      data: { roomTypeId: room.id, amountMinor: rate },
    });
  }
  return room;
}

async function service(
  kind: "BREAKFAST" | "AIRPORT_TRANSFER",
  priceUnit:
    | "PER_VEHICLE"
    | "PER_BOOKING"
    | "PER_NIGHT"
    | "PER_PERSON"
    | "PER_PERSON_PER_NIGHT",
  priceMinor: number,
  childPriceMinor: number | null = null,
  active = true,
) {
  await client.serviceOffering.create({
    data: {
      id: `p6-${kind.toLowerCase()}`,
      maxVehicles: kind === "AIRPORT_TRANSFER" ? 3 : null,
      branchId: TEST_BRANCH_ID,
      kind,
      priceUnit,
      priceMinor,
      childPriceMinor,
      active,
    },
  });
}

let couponCount = 0;
async function coupon(
  code: string,
  data: Record<string, unknown> = {},
  branchIds: string[] = [],
) {
  couponCount += 1;
  return client.coupon.create({
    data: {
      id: `p6-coupon-${couponCount}`,
      code,
      kind: "PERCENT",
      percentBasisPoints: 1_500,
      allBranches: branchIds.length === 0,
      active: true,
      ...data,
      ...(branchIds.length > 0
        ? {
            branches: {
              create: branchIds.map((branchId) => ({ branchId })),
            },
          }
        : {}),
    },
  });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await resetDatabase(client);
  await createActor(client);
  await client.branch.update({
    where: { id: TEST_BRANCH_ID },
    data: { onlineBookingEnabled: true },
  });
  await createBranch(client, { id: OTHER, slug: "p6-other" });
});
afterEach(() => vi.useRealTimers());
afterAll(async () => {
  await client.$disconnect();
  await getPrisma().$disconnect();
});

describe("T-QUOTE-11 worked examples through API-P6 (M7 AC-1)", () => {
  it("example 1: 6000, 6000, 7000, 7000 = 26000 accommodation, 29900 with 15% VAT", async () => {
    const room = await listing("garden", 8_000);
    await client.ratePeriod.createMany({
      data: [
        {
          id: "p6-period-a",
          roomTypeId: room.id,
          startDate: date("2031-04-10"),
          endDate: date("2031-04-12"),
          amountMinor: 6_000,
        },
        {
          id: "p6-period-b",
          roomTypeId: room.id,
          startDate: date("2031-04-12"),
          endDate: date("2031-04-14"),
          amountMinor: 7_000,
        },
      ],
    });
    const body = await ok(
      quoteRequest({ stay: { checkIn: "2031-04-10", checkOut: "2031-04-14" } }),
    );
    expect(body).toMatchObject({ available: true, bookable: true });
    expect(
      body.quote?.lines[0]?.nights.map((n) => n.amount.amountMinor),
    ).toEqual([6_000, 6_000, 7_000, 7_000]);
    expect(body.quote).toMatchObject({
      accommodation: usd(26_000),
      vat: usd(3_900),
      total: usd(29_900),
    });
    expect(JSON.stringify(body)).not.toContain("p6-period");
  });

  it("example 2: two units, two services, a 15% coupon, 15% VAT = 64026", async () => {
    await listing("garden", 8_000);
    await listing("apartment", 12_000, { type: "APARTMENT" });
    await service("BREAKFAST", "PER_BOOKING", 3_000);
    await service("AIRPORT_TRANSFER", "PER_BOOKING", 2_500);
    await coupon("SAVE15");
    const body = await ok(
      quoteRequest({
        lines: [
          { roomSlug: "garden", occupancy: { adults: 2, children: 0 } },
          { roomSlug: "apartment", occupancy: { adults: 2, children: 0 } },
        ],
        services: ["BREAKFAST", "AIRPORT_TRANSFER"],
        couponCode: "save15",
      }),
    );
    expect(body.quote).toMatchObject({
      accommodation: usd(60_000),
      servicesTotal: usd(5_500),
      subtotal: usd(65_500),
      discount: usd(9_825),
      taxable: usd(55_675),
      vat: usd(8_351),
      total: usd(64_026),
      coupon: { code: "SAVE15", kind: "PERCENT", percentBasisPoints: 1_500 },
    });
  });

  it("example 3: VAT 1501.5 rounds to 1502 and a 10% coupon on 33333 gives 3333", async () => {
    const room = await listing("garden", 10_010);
    const vat = await ok(
      quoteRequest({ stay: { checkIn: "2031-04-10", checkOut: "2031-04-11" } }),
    );
    expect(vat.quote).toMatchObject({ vat: usd(1_502), total: usd(11_512) });
    await client.roomBaseRate.update({
      where: { roomTypeId: room.id },
      data: { amountMinor: 11_111 },
    });
    await coupon("TENPCT", { percentBasisPoints: 1_000 });
    const percent = await ok(quoteRequest({ couponCode: "TENPCT" }));
    expect(percent.quote).toMatchObject({
      subtotal: usd(33_333),
      discount: usd(3_333),
    });
  });

  it("example 4: a fixed coupon above the subtotal gives total 0", async () => {
    await listing("garden", 4_000);
    await coupon("FIXED5", {
      kind: "FIXED",
      percentBasisPoints: null,
      amountMinor: 5_000,
    });
    const body = await ok(
      quoteRequest({
        stay: { checkIn: "2031-04-10", checkOut: "2031-04-11" },
        couponCode: "FIXED5",
      }),
    );
    expect(body.quote).toMatchObject({
      subtotal: usd(4_000),
      discount: usd(4_000),
      taxable: usd(0),
      vat: usd(0),
      total: usd(0),
    });
  });

  it("example 5: per person per night breakfast with a child price = 39100", async () => {
    await listing("garden", 8_000);
    await service("BREAKFAST", "PER_PERSON_PER_NIGHT", 1_000, 500);
    await service("AIRPORT_TRANSFER", "PER_BOOKING", 2_500);
    const body = await ok(
      quoteRequest({
        lines: [{ roomSlug: "garden", occupancy: { adults: 2, children: 1 } }],
        services: ["BREAKFAST", "AIRPORT_TRANSFER"],
      }),
    );
    expect(body.quote).toMatchObject({
      accommodation: usd(24_000),
      servicesTotal: usd(10_000),
      subtotal: usd(34_000),
      vat: usd(5_100),
      total: usd(39_100),
    });
    expect(body.quote?.services[0]).toMatchObject({
      kind: "BREAKFAST",
      unit: "PER_PERSON_PER_NIGHT",
      price: usd(1_000),
      childPrice: usd(500),
      adultQuantity: 6,
      childQuantity: 3,
      amount: usd(7_500),
    });
  });

  it("uses the stored VAT rate for 0% and 100%", async () => {
    await listing("garden", 8_000);
    for (const [rate, vat] of [
      [0, 0],
      [10_000, 24_000],
    ] as const) {
      await client.commercialSettings.update({
        where: { id: "default" },
        data: { vatRateBasisPoints: rate },
      });
      const body = await ok(quoteRequest());
      expect(body.quote).toMatchObject({
        vatRateBasisPoints: rate,
        vat: usd(vat),
      });
    }
  });
});

describe("API-P6 availability, services and trust (AC-3, AC-6)", () => {
  it("returns unavailable lines and a null quote when units run out", async () => {
    await listing("garden", 8_000, { units: 2 });
    const body = await ok(
      quoteRequest({
        lines: Array.from({ length: 3 }, () => ({
          roomSlug: "garden",
          occupancy: { adults: 1, children: 0 },
        })),
      }),
    );
    expect(body).toMatchObject({
      available: false,
      unavailableLines: [0, 1, 2],
      bookable: false,
      quote: null,
    });
  });

  it("counts a blocked unit as unavailable and an unpriced listing too", async () => {
    const room = await listing("garden", 8_000, { units: 1 });
    await listing("bare", null);
    await client.inventoryBlock.create({
      data: {
        id: "p6-block",
        branchId: TEST_BRANCH_ID,
        physicalRoomId: (
          await client.physicalRoom.findFirstOrThrow({
            where: { roomTypeId: room.id },
          })
        ).id,
        startDate: date("2031-04-11"),
        endDate: date("2031-04-12"),
        reason: "MAINTENANCE",
        createdById: "actor-admin",
      },
    });
    const body = await ok(
      quoteRequest({
        lines: [
          { roomSlug: "garden", occupancy: { adults: 1, children: 0 } },
          { roomSlug: "bare", occupancy: { adults: 1, children: 0 } },
        ],
      }),
    );
    expect(body).toMatchObject({
      available: false,
      unavailableLines: [0, 1],
      quote: null,
    });
  });

  it("reports bookable false when the branch switch is off, with a full quote", async () => {
    await listing("garden", 8_000);
    await client.branch.update({
      where: { id: TEST_BRANCH_ID },
      data: { onlineBookingEnabled: false },
    });
    const body = await ok(quoteRequest());
    expect(body.available).toBe(true);
    expect(body.bookable).toBe(false);
    expect(body.quote).not.toBeNull();
  });

  it("answers 404 for an unknown or inactive branch", async () => {
    await listing("garden", 8_000);
    expect((await post(quoteRequest({ branchSlug: "nowhere" }))).status).toBe(
      404,
    );
    await client.branch.update({
      where: { id: TEST_BRANCH_ID },
      data: { status: "INACTIVE" },
    });
    expect((await post(quoteRequest())).status).toBe(404);
  });

  it("answers 422 for a listing of another branch without leaking it", async () => {
    await listing("garden", 8_000);
    await listing("far-away", 5_000, { branchId: OTHER });
    const response = await post(
      quoteRequest({
        lines: [
          { roomSlug: "far-away", occupancy: { adults: 1, children: 0 } },
        ],
      }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      fieldErrors: { "lines.0.roomSlug": [expect.any(String)] },
    });
  });

  it("answers 422 for too many guests, a past stay, and an over long stay", async () => {
    await listing("garden", 8_000);
    for (const [overrides, field] of [
      [
        {
          lines: [
            { roomSlug: "garden", occupancy: { adults: 9, children: 0 } },
          ],
        },
        "lines.0.occupancy",
      ],
      [
        { stay: { checkIn: "2031-02-01", checkOut: "2031-02-03" } },
        "stay.checkIn",
      ],
      [
        { stay: { checkIn: "2031-04-01", checkOut: "2031-06-01" } },
        "stay.checkOut",
      ],
    ] as const) {
      const response = await post(quoteRequest(overrides));
      expect(response.status).toBe(422);
      expect((await response.json()).fieldErrors[field]).toBeDefined();
    }
  });

  it("adds services only when requested and answers 409 SERVICE_UNAVAILABLE otherwise", async () => {
    await listing("garden", 8_000);
    await service("BREAKFAST", "PER_BOOKING", 3_000);
    await service("AIRPORT_TRANSFER", "PER_BOOKING", 2_500, null, false);
    const none = await ok(quoteRequest());
    expect(none.quote?.services).toEqual([]);
    const inactive = await post(
      quoteRequest({ services: ["AIRPORT_TRANSFER"] }),
    );
    expect(inactive.status).toBe(409);
    expect(await inactive.json()).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      context: { kind: "AIRPORT_TRANSFER" },
    });
    await client.serviceOffering.deleteMany({ where: { kind: "BREAKFAST" } });
    const missing = await post(quoteRequest({ services: ["BREAKFAST"] }));
    expect(missing.status).toBe(409);
    expect(
      (await post(quoteRequest({ services: ["BREAKFAST", "BREAKFAST"] })))
        .status,
    ).toBe(422);
  });

  it.each([
    ["total", { total: usd(1) }],
    ["discount", { discount: usd(1) }],
    ["vat", { vatRateBasisPoints: 0 }],
    [
      "a price on a line",
      {
        lines: [
          {
            roomSlug: "garden",
            occupancy: { adults: 1, children: 0 },
            price: usd(1),
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
  ])(
    "refuses client supplied %s with 422 and quotes nothing",
    async (_label, extra) => {
      await listing("garden", 8_000);
      const response = await post(quoteRequest(extra));
      expect(response.status).toBe(422);
      expect((await response.json()).code).toBe("VALIDATION");
    },
  );

  it("writes nothing: tables outside the limiter are unchanged", async () => {
    await listing("garden", 8_000);
    await service("BREAKFAST", "PER_BOOKING", 3_000);
    await coupon("SAVE15");
    const snapshot = async () => ({
      audits: await client.auditEvent.count(),
      coupons: await client.coupon.count(),
      services: await client.serviceOffering.count(),
      periods: await client.ratePeriod.count(),
      blocks: await client.inventoryBlock.count(),
    });
    const before = await snapshot();
    await ok(quoteRequest({ services: ["BREAKFAST"], couponCode: "SAVE15" }));
    // Refused and unavailable requests write nothing either.
    expect((await post(quoteRequest({ couponCode: "NOPE" }))).status).toBe(422);
    expect(
      (await post(quoteRequest({ services: ["AIRPORT_TRANSFER"] }))).status,
    ).toBe(409);
    await ok(
      quoteRequest({
        lines: Array.from({ length: 3 }, () => ({
          roomSlug: "garden",
          occupancy: { adults: 1, children: 0 },
        })),
      }),
    );
    expect(await snapshot()).toEqual(before);
  });
});

describe("API-P6 coupons (AC-4)", () => {
  beforeEach(async () => {
    await listing("garden", 8_000);
  });
  const attempt = async (code: string, extra: Record<string, unknown> = {}) => {
    const response = await post(quoteRequest({ couponCode: code, ...extra }));
    return { status: response.status, body: await response.json() };
  };

  it("refuses every reason as 422 COUPON_INVALID with the same message", async () => {
    await coupon("OFF", { active: false });
    await coupon("LATER", { startsAt: date("2031-06-01") });
    await coupon("OLD", { endsAt: date("2031-02-01") });
    await coupon("ELSEWHERE", {}, [OTHER]);
    await coupon("PHONE1", { maxRedemptionsPerPhone: 0 + 1 });
    const results = await Promise.all(
      ["NOPE", "OFF", "LATER", "OLD", "ELSEWHERE"].map((code) => attempt(code)),
    );
    expect(results.map((r) => r.body.context.reason)).toEqual([
      "NOT_FOUND",
      "INACTIVE",
      "NOT_YET_VALID",
      "EXPIRED",
      "WRONG_BRANCH",
    ]);
    expect(results.every((r) => r.status === 422)).toBe(true);
    expect(new Set(results.map((r) => r.body.detail)).size).toBe(1);
    expect(
      results.every((r) => r.body.fieldErrors.couponCode.length === 1),
    ).toBe(true);
    // The phone is never matched on a public quote, so a per phone limit
    // never trips here, even once redemptions are persisted (M8-T7).
    expect((await attempt("PHONE1", { phone: "+201001234567" })).status).toBe(
      200,
    );
  });

  it("stays phone blind with persisted redemptions, but counts the overall limit", async () => {
    const room = await client.room.findFirstOrThrow({
      where: { slug: "garden" },
    });
    const phone = "+201001234567";
    const once = await coupon("ONCE", {
      maxRedemptions: 2,
      maxRedemptionsPerPhone: 1,
    });
    const stored = await new PrismaReservationRepository(client).insert(
      reservationInput(room.id, { stay: range("2031-06-10", "2031-06-12") }),
    );
    if (!stored.ok || !stored.value) throw new Error("fixture failed");
    await client.couponRedemption.create({
      data: {
        couponId: once.id,
        reservationId: stored.value.id,
        phone,
      },
    });
    // This phone already used its one redemption, yet P6 answers as it would
    // for any phone, so a guesser cannot learn who used a coupon.
    expect((await attempt("ONCE", { phone })).status).toBe(200);
    expect((await attempt("ONCE")).status).toBe(200);
    // The overall count is real: with the last redemption used, it is refused.
    const second = await new PrismaReservationRepository(client).insert(
      reservationInput(room.id, { stay: range("2031-07-10", "2031-07-12") }),
    );
    if (!second.ok || !second.value) throw new Error("fixture failed");
    await client.couponRedemption.create({
      data: { couponId: once.id, reservationId: second.value.id },
    });
    const refused = await attempt("ONCE", { phone });
    expect(refused).toMatchObject({
      status: 422,
      body: { context: { reason: "LIMIT_REACHED" } },
    });
  });

  it("matches case and spacing, and a code for this branch works", async () => {
    await coupon("SPRING", {}, [TEST_BRANCH_ID]);
    const result = await attempt("  sPrInG ");
    expect(result.status).toBe(200);
    expect(result.body.quote.coupon.code).toBe("SPRING");
  });

  it("treats a malformed code as not found", async () => {
    const result = await attempt("!!");
    expect(result).toMatchObject({
      status: 422,
      body: { context: { reason: "NOT_FOUND" } },
    });
  });
});

describe("API-P6 rate limits (T-QUOTE-12)", () => {
  beforeEach(async () => {
    await listing("garden", 8_000);
  });

  it("limits quotes to 60 a minute with Retry-After, then recovers", async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 61; index += 1) {
      statuses.push((await post(quoteRequest())).status);
    }
    expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true);
    expect(statuses[60]).toBe(429);
    const limited = await post(quoteRequest());
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    vi.setSystemTime(new Date(NOW.getTime() + 61_000));
    expect((await post(quoteRequest())).status).toBe(200);
  });

  it("limits coupon attempts to 20 per 10 minutes without touching code free quotes", async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 21; index += 1) {
      statuses.push((await post(quoteRequest({ couponCode: "GUESS" }))).status);
    }
    expect(statuses.slice(0, 20).every((status) => status === 422)).toBe(true);
    expect(statuses[20]).toBe(429);
    // A request without a code is not held back by the coupon limit.
    expect((await post(quoteRequest())).status).toBe(200);
    vi.setSystemTime(new Date(NOW.getTime() + 601_000));
    expect((await post(quoteRequest({ couponCode: "GUESS" }))).status).toBe(
      422,
    );
  });

  it("admits exactly 20 of 30 parallel coupon attempts", async () => {
    const responses = await Promise.all(
      Array.from({ length: 30 }, () =>
        post(quoteRequest({ couponCode: "GUESS" })),
      ),
    );
    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 422)).toHaveLength(20);
    expect(statuses.filter((status) => status === 429)).toHaveLength(10);
  });

  it("keys the limiter on the client only and stores no phone or code", async () => {
    await post(
      quoteRequest({ couponCode: "SECRETCODE", phone: "+201001234567" }),
    );
    const keys = (await client.loginThrottle.findMany()).map((row) => row.key);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => /^rl:quote(-coupon)?:/.test(key))).toBe(true);
    expect(keys.join()).not.toMatch(/SECRETCODE|201001234567/i);
  });

  it("prunes expired quote and quote-coupon buckets and keeps active ones", async () => {
    const old = new Date(NOW.getTime() - 3_600_000);
    const row = (key: string, windowStartedAt: Date) => ({
      key,
      failures: 3,
      windowStartedAt,
      updatedAt: windowStartedAt,
    });
    await client.loginThrottle.createMany({
      data: [
        row("rl:quote:old", old),
        row("rl:quote-coupon:old", old),
        row("rl:quote-coupon:fresh", NOW),
        row("rl:availability:old", old),
        row("rl:quote-extra:old", old),
      ],
    });
    const store = new PrismaPublicRateLimitStore(client, { now: () => NOW });
    expect(await store.cleanupExpired(NOW)).toBe(3);
    expect(
      (await client.loginThrottle.findMany({ orderBy: { key: "asc" } })).map(
        (r) => r.key,
      ),
    ).toEqual(["rl:quote-coupon:fresh", "rl:quote-extra:old"]);
  });
});

it("P6 refuses a quote when persisted sales leave too few units", async () => {
  const room = await listing("garden", 8000, { units: 2 });
  const input = reservationInput(room.id, {
    stay: range("2031-04-10", "2031-04-13"),
  });
  expect((await new PrismaReservationRepository(client).insert(input)).ok).toBe(
    true,
  );
  expect(
    await ok(
      quoteRequest({
        lines: Array.from({ length: 2 }, () => ({
          roomSlug: "garden",
          occupancy: { adults: 1, children: 0 },
        })),
      }),
    ),
  ).toMatchObject({ available: false, quote: null, unavailableLines: [0, 1] });
  expect(await ok(quoteRequest())).toMatchObject({ available: true });
});

it("T-SVC-VEH: P6 prices car objects, retains bare requests, and reports indexed count errors", async () => {
  await listing("garden", 8000);
  await service("AIRPORT_TRANSFER", "PER_VEHICLE", 4000);
  expect(
    await ok(
      quoteRequest({
        services: [{ kind: "AIRPORT_TRANSFER", vehicles: 2, details: "MS123" }],
      }),
    ),
  ).toMatchObject({
    quote: {
      services: [{ vehicles: 2, adultQuantity: 2, amount: usd(8000) }],
      servicesTotal: usd(8000),
      subtotal: usd(32000),
      vat: usd(4800),
      total: usd(36800),
    },
  });
  expect(
    await ok(quoteRequest({ services: ["AIRPORT_TRANSFER"] })),
  ).toMatchObject({
    quote: { services: [{ vehicles: 1, amount: usd(4000) }] },
  });
  for (const vehicles of [0, 4, 11, 1.5, null, "2"]) {
    const response = await post(
      quoteRequest({ services: [{ kind: "AIRPORT_TRANSFER", vehicles }] }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      fieldErrors: { "services.0.vehicles": expect.any(Array) },
    });
  }
  // The HTTP contract refuses control characters in details, like the domain.
  const header = await post(
    quoteRequest({
      services: [{ kind: "AIRPORT_TRANSFER", details: "MS123\r\nX-Bad: 1" }],
    }),
  );
  expect(header.status).toBe(422);
  expect(await header.json()).toMatchObject({
    fieldErrors: { "services.0.details": expect.any(Array) },
  });
  await service("BREAKFAST", "PER_PERSON", 1000);
  const breakfast = await post(
    quoteRequest({ services: [{ kind: "BREAKFAST", vehicles: 1 }] }),
  );
  expect(breakfast.status).toBe(422);
  expect(await breakfast.json()).toMatchObject({
    fieldErrors: { "services.0.vehicles": expect.any(Array) },
  });
});

it("T-SVC-VEH: P6 retains car counts without multiplying per-booking prices", async () => {
  await listing("garden", 8000);
  await service("AIRPORT_TRANSFER", "PER_BOOKING", 4000);
  expect(
    await ok(
      quoteRequest({ services: [{ kind: "AIRPORT_TRANSFER", vehicles: 3 }] }),
    ),
  ).toMatchObject({
    quote: { services: [{ vehicles: 3, adultQuantity: 1, amount: usd(4000) }] },
  });
});
