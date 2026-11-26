import { randomUUID } from "node:crypto";

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { PaymentGateway } from "@/application/payments";
import { dailyTotals } from "@/domain/analytics";
import { HmacThrottleKeys } from "@/infrastructure/auth/throttle-keys";
import { NodePhoneVerificationCrypto } from "@/infrastructure/crypto/phone-verification-crypto";
import {
  PrismaSiteEventStore,
  PrismaSiteRollupStore,
} from "@/infrastructure/db/prisma/repositories/analytics/site-analytics-store";
import { signedCallback } from "@/infrastructure/payments/fake/callback";
import { FakePaymentGateway } from "@/infrastructure/payments/fake/fake-payment-gateway";

import {
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import { deferred, withIndependentClients } from "./support/concurrency";
import { callbackEvent } from "./support/payment-callback";
import {
  bookingBody,
  configureWhatsApp,
  issueToken,
  NOW,
  phoneOf,
  seedBookable,
  waitForLockWaiters,
} from "./support/website-booking";

// M10-T0b, T-ANL-7 and T-ANL-8: server side booking steps through the real
// routes, production composition and PostgreSQL. No real sends or payments.
const FAKE_SECRET = "analytics-funnel-fake-secret-0123456789ab";
vi.stubEnv("PAYMENT_PROVIDER", "fake");
vi.stubEnv("PAYMENT_FAKE_SECRET", FAKE_SECRET);
vi.stubEnv("WHATSAPP_PROVIDER", "fake");
vi.stubEnv("EMAIL_PROVIDER", "fake");
vi.stubEnv(
  "PHONE_VERIFICATION_SECRET",
  "analytics-funnel-phone-secret-0123456789",
);
const settings = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/lib/env/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/env/server")>();
  return {
    getServerEnv: () => ({
      ...original.getServerEnv(),
      ANALYTICS_ENABLED: settings.enabled,
      AUTH_TRUST_PROXY_HEADERS: true,
    }),
  };
});
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  updateTag: () => undefined,
  revalidateTag: () => undefined,
}));
const deferredWork = vi.hoisted(() => ({
  hold: null as null | (() => Promise<void>)[],
}));
vi.mock("next/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("next/server")>();
  return {
    ...original,
    connection: async () => undefined,
    // Outside a request the real `after` throws, which is the job's path.
    after: (work: () => Promise<void>) => {
      if (deferredWork.hold) deferredWork.hold.push(work);
      else original.after(work);
    },
  };
});
vi.mock("@/composition/auth", () => ({
  resolveStaffFromHeaders: async () => null,
  throttleKeys: () => new HmacThrottleKeys("analytics-funnel-hmac-secret"),
}));

const search = await import(
  "@/app/api/v1/branches/[branchSlug]/availability/route"
);
const quotes = await import("@/app/api/v1/quotes/route");
const codes = await import("@/app/api/v1/phone-verifications/route");
const confirmations = await import(
  "@/app/api/v1/phone-verifications/[verificationId]/confirmation/route"
);
const reservations = await import("@/app/api/v1/reservations/route");
const callbacks = await import("@/app/api/v1/payments/callback/route");
const { expirePaymentHolds, processPaymentCallback, reconcilePayments } =
  await import("@/composition/reservations");

const client = createTestClient();
const phone = phoneOf(1);
const visit = "ab".repeat(16);
const agent = "Mozilla/5.0 Android Mobile";
const address = "203.0.113.44";
const callbackUrl = new URL("http://localhost/api/v1/payments/callback");
let clientNumber = 0;

type Headers_ = Record<string, string>;
/** Each call uses its own client address unless a test names one. */
const headers = (extra: Headers_ = {}): Headers_ => ({
  "content-type": "application/json",
  "user-agent": agent,
  "x-forwarded-for": `198.51.100.${(clientNumber = (clientNumber % 250) + 1)}`,
  ...extra,
});
const tracked = (extra: Headers_ = {}) =>
  headers({ "rivana-analytics-session": visit, ...extra });

const post = (path: string, body: unknown, with_: Headers_) =>
  new Request(`http://localhost/api/v1/${path}`, {
    method: "POST",
    headers: with_,
    body: JSON.stringify(body),
  });

const searching = (with_: Headers_) =>
  search.GET(
    new Request(
      "http://localhost/api/v1/branches/new-cairo/availability?checkIn=2031-04-10&checkOut=2031-04-13&adults=2&children=0",
      { headers: with_ },
    ),
    { params: Promise.resolve({ branchSlug: "new-cairo" }) },
  );

const quoteBody = (...slugs: string[]) => ({
  branchSlug: "new-cairo",
  stay: { checkIn: "2031-04-10", checkOut: "2031-04-13" },
  lines: (slugs.length ? slugs : ["garden"]).map((roomSlug) => ({
    roomSlug,
    occupancy: { adults: 2, children: 0 },
  })),
  services: [],
});
const quoting = (with_: Headers_, ...slugs: string[]) =>
  quotes.POST(post("quotes", quoteBody(...slugs), with_));

const booking = (
  body: unknown,
  with_: Headers_ = headers(),
  key = "key-0001",
) =>
  reservations.POST(
    post("reservations", body, { ...with_, "idempotency-key": key }),
  );

const callback = (event: ReturnType<typeof callbackEvent>) => {
  const { rawBody, headers: signed } = signedCallback(
    FAKE_SECRET,
    callbackUrl,
    event,
  );
  return callbacks.POST(
    new Request(callbackUrl, {
      method: "POST",
      headers: signed,
      body: rawBody as BodyInit,
    }),
  );
};

const events = () =>
  client.siteEvent.findMany({ orderBy: { id: "asc" }, omit: { id: true } });
const names = async () => (await events()).map((row) => row.name);
const storedSession = async () =>
  (
    await client.reservation.findFirstOrThrow({
      select: { analyticsSessionId: true },
    })
  ).analyticsSessionId;

async function seed(options: { units?: number } = {}) {
  const room = await seedBookable(client, options);
  await configureWhatsApp(client);
  await client.branch.update({
    where: { id: TEST_BRANCH_ID },
    data: { onlinePaymentEnabled: true },
  });
  return room;
}

async function bookOnline(extra: Record<string, unknown> = {}) {
  await seed({ units: 1 });
  const response = await booking(
    bookingBody(phone, await issueToken(client, phone), {
      paymentMethod: "ONLINE",
      analyticsSessionId: visit,
      ...extra,
    }),
  );
  expect(response.status).toBe(201);
  return client.payment.findFirstOrThrow();
}

beforeEach(async () => {
  settings.enabled = true;
  deferredWork.hold = null;
  await resetDatabase(client);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
afterAll(() => client.$disconnect());

describe("the journey (AC-11, AC-13)", () => {
  it("stores every step of a pay at hotel booking under one visit, with no cookie and no personal data", async () => {
    const room = await seed();
    vi.spyOn(
      NodePhoneVerificationCrypto.prototype,
      "generateCode",
    ).mockReturnValue("428913");
    const same = () => tracked({ "x-forwarded-for": address });

    const responses = [await searching(same()), await quoting(same())];
    const requested = await codes.POST(
      post("phone-verifications", { phone, purpose: "BOOKING" }, same()),
    );
    responses.push(requested);
    const { verificationId } = await requested.clone().json();
    const confirmed = await confirmations.POST(
      post(
        `phone-verifications/${verificationId}/confirmation`,
        { code: "428913" },
        same(),
      ),
      { params: Promise.resolve({ verificationId }) },
    );
    responses.push(confirmed);
    const { token } = await confirmed.clone().json();
    const created = await booking(
      bookingBody(phone, token, { analyticsSessionId: visit }),
      same(),
    );
    responses.push(created);
    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 201, 200, 201,
    ]);
    for (const response of responses)
      expect(response.headers.has("set-cookie")).toBe(false);

    const rows = await events();
    expect(
      rows.map((row) => [row.name, row.funnelStep, row.branchId, row.roomId]),
    ).toEqual([
      ["SEARCH", 3, TEST_BRANCH_ID, null],
      ["QUOTE", 4, TEST_BRANCH_ID, room.id],
      ["CODE_REQUESTED", 5, null, null],
      ["PHONE_VERIFIED", 6, null, null],
      ["BOOKING_SUBMITTED", 7, TEST_BRANCH_ID, null],
      ["BOOKING_CONFIRMED", 8, TEST_BRANCH_ID, room.id],
    ]);
    expect(new Set(rows.map((row) => row.sessionId))).toEqual(new Set([visit]));
    expect(new Set(rows.map((row) => row.visitorHash))).toEqual(
      new Set([expect.stringMatching(/^[0-9a-f]{32}$/)]),
    );
    for (const row of rows)
      expect(row).toMatchObject({
        occurredAt: NOW,
        device: "MOBILE",
        path: null,
        outcome: null,
        stayCheckIn: null,
      });
    const { reference } = await created.json();
    const stored = JSON.stringify(rows);
    for (const secret of [
      "Amina",
      "amina@example.test",
      phone,
      reference,
      token,
      verificationId,
      "428913",
      address,
      "Android",
    ])
      expect(stored).not.toContain(secret);
    expect(await storedSession()).toBeNull();

    // A retry of the same request records nothing more.
    const replay = await booking(
      bookingBody(phone, token, { analyticsSessionId: "cd".repeat(16) }),
      same(),
    );
    expect(replay.status).toBe(200);
    expect(await events()).toHaveLength(6);
  });

  it("ignores sign in codes for My reservations", async () => {
    await seed();
    vi.spyOn(
      NodePhoneVerificationCrypto.prototype,
      "generateCode",
    ).mockReturnValue("111222");
    const requested = await codes.POST(
      post(
        "phone-verifications",
        { phone, purpose: "GUEST_SESSION" },
        tracked(),
      ),
    );
    expect(requested.status).toBe(201);
    const { verificationId } = await requested.json();
    const confirmed = await confirmations.POST(
      post(
        `phone-verifications/${verificationId}/confirmation`,
        { code: "111222" },
        tracked(),
      ),
      { params: Promise.resolve({ verificationId }) },
    );
    expect(confirmed.status).toBe(200);
    expect(await events()).toEqual([]);
  });

  it("skips a repeated quote of the same listing for thirty minutes, and keeps each listing", async () => {
    const garden = await seed();
    const suite = await seedBookable(client, { slug: "suite" });
    await quoting(tracked(), "garden");
    await quoting(tracked(), "garden");
    await quoting(tracked(), "garden", "suite");
    expect((await events()).map((row) => row.roomId)).toEqual([
      garden.id,
      suite.id,
    ]);
    vi.setSystemTime(new Date(NOW.getTime() + 30 * 60_000 - 1));
    await quoting(tracked(), "garden");
    expect(await events()).toHaveLength(2);
    vi.setSystemTime(new Date(NOW.getTime() + 30 * 60_000));
    await quoting(tracked(), "garden");
    expect(await events()).toHaveLength(3);
    // Another visit is not a repeat.
    await quoting(
      headers({ "rivana-analytics-session": "EF".repeat(16) }),
      "garden",
    );
    expect((await events()).at(-1)?.sessionId).toBe("ef".repeat(16));
  });

  it("records unmet demand without a visit, with the stay dates, and nothing else", async () => {
    await seed({ units: 1 });
    expect((await searching(headers())).status).toBe(200);
    expect((await quoting(headers())).status).toBe(200);
    expect(await events()).toEqual([]);

    expect(
      (await booking(bookingBody(phone, await issueToken(client, phone))))
        .status,
    ).toBe(201);
    expect((await searching(headers())).status).toBe(200);
    // A sold out quote returns no price, so it is not a built quote.
    const soldOut = await quoting(tracked());
    expect(await soldOut.json()).toMatchObject({ quote: null });
    expect(await events()).toMatchObject([
      {
        name: "SEARCH",
        sessionId: null,
        funnelStep: null,
        outcome: "NO_AVAILABILITY",
        branchId: TEST_BRANCH_ID,
        stayCheckIn: new Date("2031-04-10T00:00:00Z"),
        stayCheckOut: new Date("2031-04-13T00:00:00Z"),
      },
    ]);
    expect(await events()).toHaveLength(1);
  });

  it("records the two checkout refusals with their reason, and no other failure", async () => {
    await seed({ units: 1 });
    const token = await issueToken(client, phone);
    const price = await booking(
      bookingBody(phone, token, {
        analyticsSessionId: visit,
        expectedTotal: { amountMinor: 1, currency: "USD" },
      }),
    );
    expect(await price.json()).toMatchObject({ code: "PRICE_CHANGED" });
    const unverified = await booking(
      bookingBody(phone, "never-issued-token-0123456789", {
        analyticsSessionId: visit,
      }),
    );
    expect(unverified.status).toBe(401);
    expect((await booking(bookingBody(phone, token))).status).toBe(201);
    const other = phoneOf(2);
    const sold = await booking(
      bookingBody(other, await issueToken(client, other), {
        analyticsSessionId: visit,
      }),
      headers(),
      "key-0002",
    );
    expect(await sold.json()).toMatchObject({ code: "INVENTORY_UNAVAILABLE" });
    expect(await events()).toMatchObject([
      {
        name: "CHECKOUT_REFUSED",
        outcome: "PRICE_CHANGED",
        branchId: TEST_BRANCH_ID,
        funnelStep: null,
      },
      { name: "CHECKOUT_REFUSED", outcome: "INVENTORY_UNAVAILABLE" },
    ]);
    expect(await events()).toHaveLength(2);
  });
});

describe("repeated refusals", () => {
  it("counts every refusal answered, with the visit counted once by the totals (FR-ANL)", async () => {
    await seed({ units: 1 });
    const body = bookingBody(phone, await issueToken(client, phone), {
      analyticsSessionId: visit,
      expectedTotal: { amountMinor: 1, currency: "USD" },
    });
    expect((await booking(body)).status).toBe(409);
    expect((await booking(body)).status).toBe(409);
    expect(await names()).toEqual(["CHECKOUT_REFUSED", "CHECKOUT_REFUSED"]);
    const stored = await new PrismaSiteRollupStore(client).eventsBetween(
      NOW,
      new Date(NOW.getTime() + 1),
    );
    expect(
      dailyTotals(NOW.toISOString().slice(0, 10), stored).filter(
        (row) => row.dimension === "REFUSAL" && row.branchId === "*",
      ),
    ).toMatchObject([{ key: "PRICE_CHANGED", sessions: 1, count: 2 }]);
  });
});

describe("privacy and failure isolation", () => {
  it.each([
    ["tracking off", {}, false],
    ["Global Privacy Control", { "sec-gpc": "1" }, true],
    ["Do Not Track", { dnt: "1" }, true],
    ["a bot", { "user-agent": "Googlebot" }, true],
  ] as const)(
    "stores nothing, not even on the booking, with %s",
    async (_, extra, enabled) => {
      settings.enabled = enabled;
      await seed({ units: 1 });
      expect((await searching(tracked(extra))).status).toBe(200);
      expect((await quoting(tracked(extra))).status).toBe(200);
      const response = await booking(
        bookingBody(phone, await issueToken(client, phone), {
          paymentMethod: "ONLINE",
          analyticsSessionId: visit,
        }),
        tracked(extra),
      );
      expect(response.status).toBe(201);
      expect((await searching(tracked(extra))).status).toBe(200);
      expect(await storedSession()).toBeNull();
      expect(await events()).toEqual([]);
      expect(await client.analyticsSalt.count()).toBe(0);
    },
  );

  it.each([7, "x".repeat(900), "AB".repeat(16), { id: visit }, null])(
    "ignores the unusable visit id %j",
    async (value) => {
      await bookOnline({ analyticsSessionId: value });
      expect(await storedSession()).toBeNull();
      expect(await events()).toEqual([]);
    },
  );

  it("answers before it records (the work runs after the response)", async () => {
    await seed();
    const held: (() => Promise<void>)[] = [];
    deferredWork.hold = held;
    expect((await quoting(tracked())).status).toBe(200);
    expect(held).toHaveLength(1);
    expect(await events()).toEqual([]);
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    await held[0]!();
    // Timed when the quote returned, not when it was written.
    expect(await events()).toMatchObject([{ name: "QUOTE", occurredAt: NOW }]);
  });

  it("changes no response or booking when PostgreSQL refuses every analytics write", async () => {
    await seed();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await client.$executeRawUnsafe(
      'ALTER TABLE "SiteEvent" ADD CONSTRAINT "test_refuse_all" CHECK (false) NOT VALID',
    );
    try {
      expect((await searching(tracked())).status).toBe(200);
      expect((await quoting(tracked())).status).toBe(200);
      const created = await booking(
        bookingBody(phone, await issueToken(client, phone), {
          paymentMethod: "ONLINE",
          analyticsSessionId: visit,
        }),
      );
      expect(created.status).toBe(201);
      const payment = await client.payment.findFirstOrThrow();
      const paid = await callback(callbackEvent(payment));
      expect(paid.status).toBe(200);
      expect(await paid.json()).toEqual({ received: true });
    } finally {
      await client.$executeRawUnsafe(
        'ALTER TABLE "SiteEvent" DROP CONSTRAINT "test_refuse_all"',
      );
    }
    expect(await client.reservation.findFirstOrThrow()).toMatchObject({
      status: "CONFIRMED",
      paymentStatus: "PAID",
      analyticsSessionId: null,
    });
    expect(await client.siteEvent.count()).toBe(0);
    // One fixed message for each lost batch, naming nothing.
    expect(new Set(warn.mock.calls.map((call) => call.join(" ")))).toEqual(
      new Set(["Analytics event recording failed."]),
    );
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it("keeps a refusal's response when the refusal cannot be recorded", async () => {
    await seed();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(PrismaSiteEventStore.prototype, "record").mockRejectedValue(
      new Error("down"),
    );
    const response = await booking(
      bookingBody(phone, await issueToken(client, phone), {
        analyticsSessionId: visit,
        expectedTotal: { amountMinor: 1, currency: "USD" },
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "PRICE_CHANGED" });
  });
});

describe("T-ANL-8: the online booking link", () => {
  it("keeps the visit until payment, then records one confirmation with no browser details", async () => {
    const payment = await bookOnline();
    expect(await storedSession()).toBe(visit);
    expect(await names()).toEqual(["BOOKING_SUBMITTED"]);
    const audits = await client.auditEvent.findMany();
    expect(JSON.stringify(audits)).not.toContain(visit);

    const event = callbackEvent(payment);
    expect((await callback(event)).status).toBe(200);
    expect((await callback(event)).status).toBe(200);
    // A second success under another event id is still the same booking.
    expect(
      (await callback({ ...event, providerEventId: randomUUID() })).status,
    ).toBe(200);
    expect(await storedSession()).toBeNull();
    expect(await names()).toEqual(["BOOKING_SUBMITTED", "BOOKING_CONFIRMED"]);
    expect((await events())[1]).toMatchObject({
      sessionId: visit,
      funnelStep: 8,
      branchId: TEST_BRANCH_ID,
      roomId: expect.any(String),
      visitorHash: null,
      device: null,
      referrerHost: null,
    });
  });

  it("counts the saved booking when checkout cannot open, once across retries", async () => {
    await seed({ units: 1 });
    const open = vi
      .spyOn(FakePaymentGateway.prototype, "createCheckout")
      .mockRejectedValueOnce(new Error("gateway timeout"));
    const body = bookingBody(phone, await issueToken(client, phone), {
      paymentMethod: "ONLINE",
      analyticsSessionId: visit,
    });
    expect((await booking(body)).status).toBe(503);
    expect(await names()).toEqual(["BOOKING_SUBMITTED"]);
    expect(await storedSession()).toBe(visit);
    expect((await booking(body)).status).toBe(200);
    expect(open).toHaveBeenCalledTimes(2);
    expect(await names()).toEqual(["BOOKING_SUBMITTED"]);
  });

  it("clears the visit when checkout is refused for good", async () => {
    await seed({ units: 1 });
    vi.spyOn(
      FakePaymentGateway.prototype,
      "createCheckout",
    ).mockResolvedValueOnce({ ok: false, code: "REFUSED" } as never);
    const response = await booking(
      bookingBody(phone, await issueToken(client, phone), {
        paymentMethod: "ONLINE",
        analyticsSessionId: visit,
      }),
    );
    expect(response.status).toBe(503);
    expect(await client.reservation.findFirstOrThrow()).toMatchObject({
      status: "PAYMENT_FAILED",
      analyticsSessionId: null,
    });
    expect(await names()).toEqual(["BOOKING_SUBMITTED"]);
  });

  it("clears the visit when the hold expires and records no late confirmation", async () => {
    const payment = await bookOnline();
    const later = new Date(NOW.getTime() + 16 * 60_000);
    vi.setSystemTime(later);
    expect(
      await expirePaymentHolds({
        client,
        clock: { now: () => later },
      }).run(),
    ).toMatchObject({ expired: 1 });
    expect(await storedSession()).toBeNull();
    expect((await callback(callbackEvent(payment))).status).toBe(200);
    expect(await client.reservation.findFirstOrThrow()).toMatchObject({
      status: "CONFIRMED",
    });
    expect(await names()).toEqual(["BOOKING_SUBMITTED"]);
  });

  it("records the confirmation that reconciliation recovers from a lost callback", async () => {
    const payment = await bookOnline();
    // The job's clock is ahead of the wall clock: the event takes the job's.
    const later = new Date(NOW.getTime() + 14 * 60_000);
    const job = reconcilePayments({
      client,
      clock: { now: () => later },
      provider: "fake",
      gateway: {
        getTransaction: async () => callbackEvent(payment),
      } as unknown as PaymentGateway,
    });
    expect(await job.run()).toMatchObject({ answered: 1, failed: 0 });
    expect(await job.run()).toMatchObject({ failed: 0 });
    expect(await storedSession()).toBeNull();
    expect(await names()).toEqual(["BOOKING_SUBMITTED", "BOOKING_CONFIRMED"]);
    expect((await events())[1]).toMatchObject({ occurredAt: later });
  });

  it("clears the visit when the payment page closes unpaid, and records nothing", async () => {
    const payment = await bookOnline();
    const closed = callbackEvent(payment, { outcome: "SESSION_CLOSED" });
    expect((await callback(closed)).status).toBe(200);
    expect(await client.reservation.findFirstOrThrow()).toMatchObject({
      status: "PAYMENT_FAILED",
      analyticsSessionId: null,
    });
    expect(await names()).toEqual(["BOOKING_SUBMITTED"]);
  });

  it("records exactly one confirmation in 20 observed callback and reconcile races", async () => {
    const later = new Date(NOW.getTime() + 14 * 60_000);
    const clock = { now: () => later };
    for (let round = 0; round < 20; round += 1) {
      await resetDatabase(client);
      vi.setSystemTime(NOW);
      const payment = await bookOnline();
      vi.setSystemTime(later);
      const first = callbackEvent(payment);
      const second = {
        ...first,
        providerEventId: `lookup-${round}`,
      };
      await withIndependentClients(3, async ([holder, one, two]) => {
        const held = deferred();
        const release = deferred();
        const lock = holder!.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Reservation" WHERE id = ${payment.reservationId} FOR UPDATE`;
          held.resolve();
          await release.promise;
        });
        await Promise.race([held.promise, lock]);
        const gateway = {
          verifyCallback: async () => first,
          getTransaction: async () => second,
        } as unknown as PaymentGateway;
        const delivered = processPaymentCallback({
          client: one!,
          clock,
          provider: "fake",
          gateway,
        }).execute({
          rawBody: new Uint8Array(),
          headers: new Headers(),
          url: callbackUrl,
        });
        const reconciled = reconcilePayments({
          client: two!,
          clock,
          provider: "fake",
          gateway,
        }).run();
        try {
          await waitForLockWaiters(client, 2);
        } finally {
          release.resolve();
          await Promise.allSettled([lock, delivered, reconciled]);
        }
        expect(await delivered).toMatchObject({ ok: true });
        expect(await reconciled).toMatchObject({ answered: 1, failed: 0 });
      });
      expect(await storedSession()).toBeNull();
      expect(
        await client.siteEvent.count({ where: { name: "BOOKING_CONFIRMED" } }),
      ).toBe(1);
    }
  }, 120_000);
});
