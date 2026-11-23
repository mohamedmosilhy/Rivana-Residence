import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { HmacThrottleKeys } from "@/infrastructure/auth/throttle-keys";

import { createTestClient, resetDatabase } from "../support/database";
import {
  bookingBody,
  configureWhatsApp,
  issueToken,
  NOW,
  phoneOf,
  rowCounts,
  seedBookable,
  TOTAL_MINOR,
  waitForLockWaiters,
} from "./support/website-booking";
import { deferred } from "./support/concurrency";

// covers: API-P7 over real HTTP handlers (AC-1, AC-8, T-HTTP, C-9) and the
// P6 per phone change (M7 AC-4). The routes use the production composition
// on the disposable database, with the fake WhatsApp transport.
vi.stubEnv("WHATSAPP_PROVIDER", "fake");
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  updateTag: () => undefined,
  revalidateTag: () => undefined,
}));
vi.mock("next/server", async (original) => ({
  ...(await original<object>()),
  connection: async () => undefined,
}));
vi.mock("@/composition/auth", () => ({
  resolveStaffFromHeaders: async () => null,
  throttleKeys: () => new HmacThrottleKeys("test-p7-hmac-secret"),
}));
const { POST } = await import("@/app/api/v1/reservations/route");
const quotes = await import("@/app/api/v1/quotes/route");

const client = createTestClient();
const phone = phoneOf(1);
const day = 86_400_000;
const date = (offset: number) =>
  new Date(NOW.getTime() + offset * day).toISOString().slice(0, 10);
const STAY = { checkIn: date(40), checkOut: date(43) };

type Body = ReturnType<typeof bookingBody>;
const body = (token: string, overrides: Record<string, unknown> = {}) =>
  bookingBody(phone, token, { stay: STAY, ...overrides });
const send = (
  payload: unknown,
  key: string | null = "route-key-0000001",
  extra: Record<string, string> = {},
) =>
  POST(
    new Request("http://localhost/api/v1/reservations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key === null ? {} : { "idempotency-key": key }),
        ...extra,
      },
      body: JSON.stringify(payload),
    }),
  );
const problemOf = async (response: Response) =>
  (await response.json()) as {
    code: string;
    detail?: string;
    context?: Record<string, unknown>;
  };

async function ready() {
  await seedBookable(client);
  await configureWhatsApp(client);
  return issueToken(client, phone);
}

// The route reads the real clock, so `Date` is pinned to the fixture clock the
// token helper uses. Timers stay real so pool and lock waits still run.
beforeEach(async () => {
  await resetDatabase(client);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
afterAll(() => client.$disconnect());

describe("POST /api/v1/reservations", () => {
  it("confirms a booking and queues its messages (AC-1)", async () => {
    const token = await ready();
    const response = await send(body(token));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const created = (await response.json()) as Record<string, unknown>;
    expect(created).toMatchObject({
      status: "CONFIRMED",
      total: { amountMinor: TOTAL_MINOR, currency: "USD" },
    });
    expect(created.reference).toMatch(/^RR-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(created.manageUrl).toMatch(/^\/reservations\/manage#t=[\w-]{20,}$/);
    const row = await client.reservation.findFirstOrThrow();
    expect(row.status).toBe("CONFIRMED");
    expect(await rowCounts(client)).toMatchObject({
      reservations: 1,
      audits: 1,
      outbox: 3,
      consumed: 1,
    });
  });

  it("replays the same key with 200 and never repeats the manage link", async () => {
    const token = await ready();
    const first = await (await send(body(token))).json();
    const replay = await send(body(token));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      reference: first.reference,
      status: "CONFIRMED",
      manageUrl: null,
    });
    expect((await rowCounts(client)).reservations).toBe(1);
  });

  it("refuses a reused key with a different body (422)", async () => {
    const token = await ready();
    await send(body(token));
    const other = await send(
      body(token, { stay: { checkIn: date(50), checkOut: date(52) } }),
    );
    expect(other.status).toBe(422);
    expect((await problemOf(other)).code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("requires the Idempotency-Key header and keeps the token unused", async () => {
    const token = await ready();
    const response = await send(body(token), null);
    expect(response.status).toBe(400);
    expect((await problemOf(response)).code).toBe("MISSING_IDEMPOTENCY_KEY");
    expect(await rowCounts(client)).toMatchObject({
      reservations: 0,
      consumed: 0,
    });
  });

  it("refuses a malformed key as validation and keeps the token unused", async () => {
    const token = await ready();
    const response = await send(body(token), "short");
    expect(response.status).toBe(422);
    expect((await problemOf(response)).code).toBe("VALIDATION");
    expect(await rowCounts(client)).toMatchObject({
      reservations: 0,
      consumed: 0,
    });
  });

  it("is strict and drops a filled honeypot", async () => {
    const token = await ready();
    for (const extra of [
      { totalMinor: 1 },
      { status: "CONFIRMED" },
      { branchId: "other" },
    ]) {
      const response = await send({ ...body(token), ...extra });
      expect(response.status).toBe(422);
      expect((await problemOf(response)).code).toBe("VALIDATION");
    }
    const spam = await send(body(token, { website: "http://spam.test" }));
    expect(spam.status).toBe(422);
    expect(await rowCounts(client)).toMatchObject({
      reservations: 0,
      consumed: 0,
    });
  });

  it("M9-T1 accepts pay at hotel, refuses ONLINE for now and rejects PAYMOB as invalid", async () => {
    const token = await ready();
    const online = await send(body(token, { paymentMethod: "ONLINE" }));
    expect(online.status).toBe(409);
    expect((await problemOf(online)).code).toBe("PAYMENT_METHOD_UNAVAILABLE");
    const retired = await send(body(token, { paymentMethod: "PAYMOB" }));
    expect(retired.status).toBe(422);
    expect((await problemOf(retired)).code).toBe("VALIDATION");
    expect(await rowCounts(client)).toMatchObject({
      reservations: 0,
      consumed: 0,
    });
    expect(await client.payment.count()).toBe(0);
    expect(await client.notificationOutbox.count()).toBe(0);

    expect((await send(body(token))).status).toBe(201);
    expect(await client.reservation.findFirst()).toMatchObject({
      status: "CONFIRMED",
      paymentMethod: "PAY_AT_HOTEL",
      paymentStatus: "NOT_REQUIRED",
    });
  });

  it("maps refusals to their documented statuses", async () => {
    const token = await ready();
    const unverified = await send(body("token-never-issued-0123456789"));
    expect(unverified.status).toBe(401);
    expect((await problemOf(unverified)).code).toBe("PHONE_NOT_VERIFIED");

    const stale = await send(
      body(token, { expectedTotal: { amountMinor: 1, currency: "USD" } }),
      "route-key-0000002",
    );
    expect(stale.status).toBe(409);
    expect((await problemOf(stale)).code).toBe("PRICE_CHANGED");

    const missing = await send(
      body(token, {
        lines: [
          { roomSlug: "no-such-room", occupancy: { adults: 1, children: 0 } },
        ],
      }),
      "route-key-0000003",
    );
    expect(missing.status).toBe(422);

    await client.branch.update({
      where: { slug: "new-cairo" },
      data: { onlineBookingEnabled: false },
    });
    const closed = await send(body(token), "route-key-0000004");
    expect(closed.status).toBe(409);
    expect(await problemOf(closed)).toMatchObject({
      code: "BRANCH_NOT_BOOKABLE",
      context: { reason: "ONLINE_BOOKING_DISABLED" },
    });
    expect((await rowCounts(client)).reservations).toBe(0);
  });

  it("reports WhatsApp not configured as the branch reason", async () => {
    await seedBookable(client);
    const token = await issueToken(client, phone);
    const response = await send(body(token));
    expect(response.status).toBe(409);
    expect((await problemOf(response)).context).toEqual({
      reason: "WHATSAPP_NOT_CONFIGURED",
    });
  });

  it("limits each client to five attempts an hour with Retry-After", async () => {
    const attempt = () => send(body("token-never-used-0123456789"), null);
    for (let count = 0; count < 5; count += 1)
      expect((await attempt()).status).toBe(400);
    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("answers parallel retries with one reservation (C-9, 20 rounds)", async () => {
    for (let round = 0; round < 20; round += 1) {
      await resetDatabase(client);
      const token = await ready();
      const key = `route-key-round-${round}-0001`;
      // Hold the guest row so all three requests are observed waiting on it
      // at once (pg_stat_activity), then release: the first to take the lock
      // books, and the others find its row on the lookup under the lock.
      await client.guest.create({
        data: { id: `guest-c9-${round}`, phone, name: "Amina Hassan" },
      });
      const holder = createTestClient();
      const locked = deferred();
      const release = deferred();
      const holding = holder.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM "Guest" WHERE phone = ${phone} FOR UPDATE`;
        locked.resolve();
        await release.promise;
      });
      let responses: Response[];
      try {
        await locked.promise;
        const pending = [0, 1, 2].map(() => send(body(token), key));
        await waitForLockWaiters(client, 3);
        release.resolve();
        await holding;
        responses = await Promise.all(pending);
      } finally {
        release.resolve();
        await holding.catch(() => undefined);
        await holder.$disconnect();
      }
      const bodies = await Promise.all(
        responses.map(async (response) => ({
          status: response.status,
          json: (await response.json()) as {
            reference: string;
            manageUrl: string | null;
          },
        })),
      );
      expect(bodies.map((item) => item.status).sort()).toEqual([200, 200, 201]);
      expect(
        bodies
          .filter((item) => item.status === 200)
          .every((item) => item.json.manageUrl === null),
      ).toBe(true);
      expect(new Set(bodies.map((item) => item.json.reference)).size).toBe(1);
      expect(await rowCounts(client)).toMatchObject({
        reservations: 1,
        consumed: 1,
        outbox: 3,
      });
    }
  });

  it("writes no guest name, email, phone, token or key to any log (AC-8)", async () => {
    const lines: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const)
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });
    const token = await ready();
    const secrets = {
      name: "Zorblax Quillfeather",
      email: "zorblax.quillfeather@example.test",
      key: "secret-idempotency-key-9f3a",
    };
    const guest = {
      fullName: secrets.name,
      email: secrets.email,
      phone,
      country: "EG",
    };
    const responses: Response[] = [];
    responses.push(await send(body(token, { guest }), secrets.key));
    responses.push(await send(body(token, { guest }), secrets.key));
    responses.push(
      await send(
        body(token, {
          guest,
          expectedTotal: { amountMinor: 1, currency: "USD" },
        }),
        "secret-other-key-77aa",
      ),
    );
    responses.push(
      await send({ ...body(token, { guest }), extra: 1 }, secrets.key),
    );
    const manage = (await (responses[0] as Response).clone().json()) as {
      manageUrl: string;
    };
    const managed = manage.manageUrl.split("#t=")[1] as string;
    const logged = lines.join("\n");
    expect(logged).toContain("/api/v1/reservations");
    for (const value of [
      secrets.name,
      secrets.email,
      secrets.key,
      phone,
      token,
      managed,
    ])
      expect(logged).not.toContain(value);
    // Refusal bodies reveal none of it either.
    for (const response of responses.slice(1)) {
      const text = await response.text();
      for (const value of [secrets.name, secrets.email, token, managed])
        expect(text).not.toContain(value);
    }
  });
});

describe("P6 ignores an unverified phone (M7 AC-4)", () => {
  it("never changes the coupon answer, while the booking enforces the limit", async () => {
    await seedBookable(client, { units: 2 });
    await configureWhatsApp(client);
    await client.coupon.create({
      data: {
        id: "coupon-1",
        code: "WELCOME",
        kind: "PERCENT",
        percentBasisPoints: 1000,
        maxRedemptionsPerPhone: 1,
        allBranches: true,
      },
    });
    const discounted = { amountMinor: 31_050, currency: "USD" };
    const first = await send(
      body(await issueToken(client, phone), {
        couponCode: "WELCOME",
        expectedTotal: discounted,
      }),
      "route-key-coupon-01",
    );
    expect(first.status).toBe(201);

    const quote = (withPhone: boolean) =>
      quotes.POST(
        new Request("http://localhost/api/v1/quotes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            branchSlug: "new-cairo",
            stay: STAY,
            lines: [
              { roomSlug: "garden", occupancy: { adults: 2, children: 0 } },
            ],
            services: [],
            couponCode: "WELCOME",
            ...(withPhone ? { phone } : {}),
          }),
        }),
      );
    const without = await quote(false);
    const withIt = await quote(true);
    expect(without.status).toBe(200);
    expect(withIt.status).toBe(200);
    expect(await withIt.json()).toEqual(await without.json());

    const second = await send(
      body(await issueToken(client, phone), {
        couponCode: "WELCOME",
        expectedTotal: discounted,
      }),
      "route-key-coupon-02",
    );
    expect(second.status).toBe(422);
    expect((await problemOf(second)).code).toBe("COUPON_INVALID");
  });
});

export type { Body };
