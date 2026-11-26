import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/v1/analytics/events/route";
import { RecordSiteEvent } from "@/application/analytics";
import {
  PrismaAnalyticsSaltStore,
  PrismaSiteEventStore,
} from "@/infrastructure/db/prisma/repositories/analytics/site-analytics-store";

import {
  createBranch,
  createRoom,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "./support/database";

import {
  deferred,
  waitForDatabaseLock,
} from "./reservations/support/concurrency";

const settings = vi.hoisted(() => ({ enabled: true, trustProxy: true }));
vi.mock("@/lib/env/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/env/server")>();
  return {
    getServerEnv: () => ({
      ...original.getServerEnv(),
      APP_URL: "http://rivana.example.test",
      BETTER_AUTH_SECRET: "analytics-integration-test-secret-only",
      ANALYTICS_ENABLED: settings.enabled,
      AUTH_TRUST_PROXY_HEADERS: settings.trustProxy,
    }),
  };
});

const client = createTestClient();
const sessionId = "a".repeat(32);
const base = "http://rivana.example.test";
const sample = {
  sessionId,
  events: [{ name: "PAGE_VIEW", path: "/new-cairo" }],
};
const oldDay = new Date("2026-11-26T00:00:00Z");
const newDay = new Date("2026-11-27T00:00:00Z");

function post(payload: unknown = sample, headers: Record<string, string> = {}) {
  return POST(
    new Request(base + "/api/v1/analytics/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: base,
        "x-forwarded-for": "203.0.113.11",
        "user-agent": "Mozilla/5.0 Android Mobile",
        ...headers,
      },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    }),
  );
}

beforeEach(async () => {
  settings.enabled = true;
  settings.trustProxy = true;
  await resetDatabase(client);
});

afterAll(() => client.$disconnect());

describe("P11 (AC-11, AC-13, T-ANL-4 through T-ANL-6)", () => {
  it("accepts a text beacon and stores only safe values resolved from the page and catalog", async () => {
    const room = await createRoom(client, {
      status: "PUBLISHED",
      slug: "garden",
    });
    await createBranch(client, { id: "second", slug: "second" });
    const other = await createRoom(client, {
      branchId: "second",
      status: "PUBLISHED",
      slug: "other",
    });
    await createRoom(client, { slug: "draft" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      const response = await post(
        {
          sessionId: sessionId.toUpperCase(),
          events: [
            {
              name: "PAGE_VIEW",
              path: "/new-cairo/stay/garden?email=guest@example.test#manage-secret",
              branchSlug: "second",
              roomSlug: other.slug,
              referrer: "https://www.google.com/search?phone=01000000000",
              utm: {
                source: "google",
                medium: "guest@example.test",
                campaign: "RR-12345678",
              },
            },
            {
              name: "PAGE_VIEW",
              path: "/new-cairo/stay/other",
              branchSlug: "second",
            },
            { name: "PAGE_VIEW", path: "/new-cairo/stay/draft" },
            { name: "STEP_VIEW", step: "SEARCH", path: "/new-cairo/book" },
            {
              name: "PAGE_VIEW",
              path: "/reservations/manage#manage-secret",
              branchSlug: "second",
            },
            { name: "PAGE_VIEW", path: "/admin/reservations/token" },
          ],
        },
        {
          "content-type": "text/plain;charset=UTF-8",
          "sec-fetch-site": "same-origin",
          "x-request-id": "manage-secret",
        },
      );
      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
      expect(response.headers.has("set-cookie")).toBe(false);
      expect(response.headers.get("x-request-id")).not.toBe("manage-secret");
      expect(response.headers.get("cache-control")).toBe("no-store");
      const rows = await client.siteEvent.findMany({
        orderBy: { id: "asc" },
        omit: { id: true },
      });
      expect(rows).toHaveLength(5);
      expect(rows[0]).toMatchObject({
        path: "/{branch}/stay/[slug]",
        name: "PAGE_VIEW",
        funnelStep: 2,
        branchId: TEST_BRANCH_ID,
        roomId: room.id,
        sessionId,
        device: "MOBILE",
        referrerHost: "www.google.com",
        utmSource: "google",
        utmMedium: null,
        utmCampaign: null,
        visitorHash: expect.stringMatching(/^[0-9a-f]{32}$/),
      });
      expect(rows[1]).toMatchObject({
        branchId: TEST_BRANCH_ID,
        roomId: null,
        funnelStep: 1,
      });
      expect(rows[2]).toMatchObject({ roomId: null, funnelStep: 1 });
      expect(rows[3]).toMatchObject({ path: "/{branch}/book", funnelStep: 3 });
      expect(rows[4]).toMatchObject({
        path: "/reservations/manage",
        branchId: null,
        roomId: null,
      });
      expect(new Set(rows.map((row) => row.visitorHash)).size).toBe(1);
      const privateValues =
        /guest@example|RR-12345678|01000000000|manage-secret|203\.0\.113\.11|Android Mobile/;
      expect(JSON.stringify(rows)).not.toMatch(privateValues);
      expect(JSON.stringify(info.mock.calls)).not.toMatch(privateValues);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      info.mockRestore();
    }
  });

  it("keeps booking steps distinct on one page and reuses its catalog lookups", async () => {
    const path = "/new-cairo/book/details";
    const room = await createRoom(client, {
      status: "PUBLISHED",
      slug: "garden",
    });
    const branchLookup = vi.spyOn(
      PrismaSiteEventStore.prototype,
      "branchIdFor",
    );
    const roomLookup = vi.spyOn(PrismaSiteEventStore.prototype, "roomIdFor");
    try {
      const response = await post({
        sessionId,
        events: [
          { name: "PAGE_VIEW", path, roomSlug: room.slug },
          { name: "STEP_VIEW", step: "DETAILS", path, roomSlug: room.slug },
          { name: "STEP_VIEW", step: "VERIFY", path, roomSlug: room.slug },
          { name: "STEP_VIEW", step: "REVIEW", path, roomSlug: room.slug },
        ],
      });
      expect(response.status).toBe(204);
      expect(branchLookup).toHaveBeenCalledTimes(1);
      expect(roomLookup).toHaveBeenCalledTimes(1);
      expect(
        await client.siteEvent.findMany({
          orderBy: { id: "asc" },
          select: { bookingStep: true, funnelStep: true, path: true },
        }),
      ).toEqual([
        { bookingStep: null, funnelStep: 1, path: "/{branch}/book/details" },
        {
          bookingStep: "DETAILS",
          funnelStep: null,
          path: "/{branch}/book/details",
        },
        {
          bookingStep: "VERIFY",
          funnelStep: null,
          path: "/{branch}/book/details",
        },
        {
          bookingStep: "REVIEW",
          funnelStep: null,
          path: "/{branch}/book/details",
        },
      ]);
    } finally {
      branchLookup.mockRestore();
      roomLookup.mockRestore();
    }
  });

  it("drops opt-outs, bots, preload requests, cross site requests, and a disabled deployment", async () => {
    for (const headers of [
      { "sec-gpc": "1" },
      { dnt: "1" },
      { purpose: "prefetch" },
      { "user-agent": "Googlebot" },
      { "sec-fetch-site": "same-site" },
      { "sec-fetch-site": "cross-site" },
      { origin: "https://another.test" },
    ])
      expect(
        (await post(sample, headers as Record<string, string>)).status,
      ).toBe(204);
    settings.enabled = false;
    expect((await post()).status).toBe(204);
    expect(await client.siteEvent.count()).toBe(0);
    expect(await client.analyticsSalt.count()).toBe(0);
  });

  it("keeps the session with no hash when the trusted address is absent or invalid", async () => {
    settings.trustProxy = false;
    expect((await post()).status).toBe(204);
    settings.trustProxy = true;
    expect(
      (await post(sample, { "x-forwarded-for": "not-an-ip" })).status,
    ).toBe(204);
    expect(
      await client.siteEvent.findMany({
        select: { sessionId: true, visitorHash: true },
      }),
    ).toEqual([
      { sessionId, visitorHash: null },
      { sessionId, visitorHash: null },
    ]);
    expect(await client.analyticsSalt.count()).toBe(0);
  });

  it("rejects bad shapes and leaves transport errors on the shared HTTP statuses", async () => {
    expect(
      (
        await post({
          ...sample,
          events: [{ ...sample.events[0], token: "manage-secret" }],
        })
      ).status,
    ).toBe(422);
    const invalidKeys = await post({ ...sample, constructor: "unknown" });
    expect(invalidKeys.status).toBe(422);
    expect(await invalidKeys.json()).toMatchObject({
      code: "VALIDATION",
      fieldErrors: { constructor: ["Unknown field."] },
    });
    expect((await post("{")).status).toBe(400);
    expect(
      (await post(sample, { "content-type": "application/xml" })).status,
    ).toBe(415);
    expect((await post("x".repeat(32_769))).status).toBe(413);
    expect(await client.siteEvent.count()).toBe(0);
  });

  it("admits 120 requests in the analytics bucket and returns Retry-After on request 121", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      settings.enabled = false;
      for (let count = 0; count < 120; count++)
        expect((await post()).status).toBe(204);
      const denied = await post();
      expect(denied.status).toBe(429);
      expect(Number(denied.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(
        (await post(sample, { "x-forwarded-for": "203.0.113.22" })).status,
      ).toBe(204);
    } finally {
      info.mockRestore();
    }
  });

  it("drops a failed batch and reports only a fixed failure message", async () => {
    const reportFailure = vi.fn();
    const store = new PrismaSiteEventStore(client);
    const record = new RecordSiteEvent({
      clock: { now: () => new Date() },
      events: {
        branchIdFor: store.branchIdFor.bind(store),
        roomIdFor: store.roomIdFor.bind(store),
        record: async () => {
          throw new Error("request included private data");
        },
      },
      salts: new PrismaAnalyticsSaltStore(client),
      makeSalt: () => Buffer.alloc(32),
      hashVisitor: () => "a".repeat(32),
      reportFailure,
    });
    await expect(
      record.execute({
        sessionId,
        events: [{ name: "PAGE_VIEW", path: "/new-cairo" }],
        clientAddress: null,
        headers: new Headers(),
      }),
    ).resolves.toBeUndefined();
    expect(reportFailure.mock.calls).toEqual([[]]);
    expect(await client.siteEvent.count()).toBe(0);
  });
});

it("T-ANL-6 rotates at UTC midnight and shares one secret in 20 observed lock races", async () => {
  const second = createTestClient();
  try {
    const left = new PrismaAnalyticsSaltStore(client);
    const right = new PrismaAnalyticsSaltStore(second);
    for (let round = 0; round < 20; round++) {
      await client.analyticsSalt.deleteMany();
      const old = await left.current(oldDay, () => Buffer.alloc(32, 1));
      expect(old).toEqual(Uint8Array.from(Buffer.alloc(32, 1)));

      const rotationReady = deferred();
      const releaseRotation = deferred();
      const observerPid = deferred<number>();
      const first = client.$transaction(async (tx) => {
        const salt = await new PrismaAnalyticsSaltStore(tx).current(
          newDay,
          () => Buffer.alloc(32, 2),
        );
        rotationReady.resolve();
        await releaseRotation.promise;
        return salt;
      });
      await Promise.race([rotationReady.promise, first]);
      const competing = second.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<
          [{ pid: number }]
        >`SELECT pg_backend_pid() AS pid`;
        observerPid.resolve(row.pid);
        return new PrismaAnalyticsSaltStore(tx).current(newDay, () =>
          Buffer.alloc(32, 3),
        );
      });
      try {
        const pid = await Promise.race([
          observerPid.promise,
          competing.then(() => {
            throw new Error(
              "The competing rotation finished before the lock was observed.",
            );
          }),
        ]);
        await waitForDatabaseLock(client, pid);
      } finally {
        releaseRotation.resolve();
        await Promise.allSettled([first, competing]);
      }
      const [one, two] = await Promise.all([first, competing]);
      expect(one).not.toBeNull();
      expect(one).not.toEqual(old);
      expect(one).toEqual(two);
      expect(await right.current(oldDay, () => Buffer.alloc(32, 4))).toBeNull();
      expect(
        await client.analyticsSalt.findMany({ select: { day: true } }),
      ).toEqual([{ day: newDay }]);
    }
  } finally {
    await second.$disconnect();
  }
});
