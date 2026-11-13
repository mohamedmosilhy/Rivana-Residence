import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createRoutes, json } from "@/app/api/v1/_http/routes";
import { RateLimiter } from "@/application/shared/rate-limit";
import { AVAILABILITY_RATE_LIMIT } from "@/application/shared/public-rate-limit-policy";
import { HmacThrottleKeys } from "@/infrastructure/auth/throttle-keys";
import { PrismaPublicRateLimitStore } from "@/infrastructure/db/prisma/repositories/public-rate-limit-store";

import { createTestClient, resetDatabase } from "./support/database";
import {
  barrier,
  deferred,
  waitForDatabaseLock,
  withIndependentClients,
} from "./reservations/support/concurrency";

const client = createTestClient();
const start = new Date("2026-11-10T12:00:00Z");
let now = start;
const clock = { now: () => now };
const store = new PrismaPublicRateLimitStore(client, clock);
const keys = new HmacThrottleKeys("test-public-rate-limit-secret-value");
const limiter = new RateLimiter(store, keys);
const rule = { maxRequests: 60, windowMs: 60_000 };
const key = (address = "203.0.113.9") =>
  keys.namespaced("availability", address);
const consume = (
  address: string | null = "203.0.113.9",
  namespace = "availability",
) => limiter.consume(namespace, AVAILABILITY_RATE_LIMIT.rule, address);

beforeEach(async () => {
  await resetDatabase(client);
  now = start;
});
afterAll(() => client.$disconnect());

async function expired(
  bucket: string,
  overrides: { windowStartedAt?: Date; lockedUntil?: Date | null } = {},
) {
  return client.loginThrottle.create({
    data: {
      key: bucket,
      failures: 60,
      windowStartedAt: new Date(+start - 60_000),
      lockedUntil: start,
      ...overrides,
    },
  });
}

// Spec 0003 AC-8, the public protection prerequisite for P5.
describe("public limiter admission (M6 AC-8)", () => {
  it("admits 60, refuses 61, does not prolong denial, and resets at exact expiry", async () => {
    for (let i = 0; i < 60; i += 1)
      expect(await consume()).toEqual({ allowed: true });
    now = new Date(+start + 1_001);
    expect(await consume()).toEqual({ allowed: false, retryAfterSeconds: 59 });
    expect(
      (await client.loginThrottle.findUniqueOrThrow({ where: { key: key() } }))
        .failures,
    ).toBe(60);
    now = new Date(+start + 59_999);
    expect(await consume()).toEqual({ allowed: false, retryAfterSeconds: 1 });
    now = new Date(+start + 60_000);
    expect(await consume()).toEqual({ allowed: true });
    expect(
      await client.loginThrottle.findUniqueOrThrow({ where: { key: key() } }),
    ).toMatchObject({ failures: 1, windowStartedAt: now, lockedUntil: null });
  });

  it("shares the anonymous bucket and separates clients and namespaces", async () => {
    for (let i = 0; i < 60; i += 1) await consume(null);
    expect(await consume(null)).toMatchObject({ allowed: false });
    expect(await consume("")).toMatchObject({ allowed: false });
    expect(await consume("198.51.100.7")).toEqual({ allowed: true });
    expect(await consume(null, "other-public")).toEqual({ allowed: true });
    const rows = await client.loginThrottle.findMany();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.key).join(" ")).not.toMatch(/anonymous|198\.51/);
  });

  it("returns HTTP 429 across branch paths using the same anonymous bucket (T-HTTP)", async () => {
    let handled = 0;
    const { publicRoute } = createRoutes({
      isSameOrigin: () => true,
      resolveStaff: async () => null,
      rateLimit: (namespace, policy) =>
        limiter.consume(namespace, policy, null),
      log: { request: () => undefined, error: () => undefined },
    });
    const handler = publicRoute(
      { route: "/api/v1/test/[branch]", rateLimit: AVAILABILITY_RATE_LIMIT },
      async () => {
        handled += 1;
        return json(200, { ok: true });
      },
    );
    for (let i = 0; i < 60; i += 1) {
      expect(
        (
          await handler(
            new Request(
              `http://localhost/api/v1/test/${i % 2 ? "new-cairo" : "giza"}`,
            ),
          )
        ).status,
      ).toBe(200);
    }
    now = new Date(+start + 1_001);
    const denied = await handler(
      new Request("http://localhost/api/v1/test/third-branch"),
    );
    expect(denied.status).toBe(429);
    expect(denied.headers.get("retry-after")).toBe("59");
    expect(denied.headers.get("cache-control")).toBe("no-store");
    expect(await denied.json()).toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });
    expect(handled).toBe(60);
  });

  it("admits exactly 60 from 80 concurrent requests for 20 iterations", async () => {
    await withIndependentClients(4, async (clients) => {
      const stores = clients.map(
        (c) => new PrismaPublicRateLimitStore(c, clock),
      );
      for (let iteration = 0; iteration < 20; iteration += 1) {
        const bucket = key(`burst-${iteration}`);
        const together = barrier(80);
        const results = await Promise.all(
          Array.from({ length: 80 }, async (_, i) => {
            await together();
            return stores[i % stores.length]!.consume(bucket, rule);
          }),
        );
        expect(results.filter((r) => r.allowed)).toHaveLength(60);
        expect(results.filter((r) => !r.allowed)).toEqual(
          Array.from({ length: 20 }, () => ({
            allowed: false,
            retryAfterSeconds: 60,
          })),
        );
        expect(
          (
            await client.loginThrottle.findUniqueOrThrow({
              where: { key: bucket },
            })
          ).failures,
        ).toBe(60);
      }
    });
  });
});

describe("public limiter expiry cleanup (M6 AC-8)", () => {
  it("deletes only expired availability buckets and preserves all other rows exactly", async () => {
    await expired(key("expired"));
    await expired(key("null-lock"), { lockedUntil: null });
    const preserved = await Promise.all([
      expired(key("active-window"), {
        windowStartedAt: new Date(+start - 59_999),
        lockedUntil: null,
      }),
      expired(key("active-lock"), { lockedUntil: new Date(+start + 1) }),
      expired("a:staff-account"),
      expired("c:staff-client"),
      expired("rl:other-public:hash"),
      expired("rl:availability-extra:hash"),
    ]);
    expect(await store.cleanupExpired(now)).toBe(2);
    expect(
      await client.loginThrottle.findMany({ orderBy: { key: "asc" } }),
    ).toEqual(preserved.sort((a, b) => a.key.localeCompare(b.key)));
    expect(await store.cleanupExpired(now)).toBe(0);
  });

  it("deletes at most 1,000 rows per namespace per invocation", async () => {
    await client.loginThrottle.createMany({
      data: Array.from({ length: 1_005 }, (_, i) => ({
        key: `rl:availability:expired-${i}`,
        failures: 60,
        windowStartedAt: new Date(+start - 60_000),
        lockedUntil: null,
      })),
    });
    expect(await store.cleanupExpired(now)).toBe(1_000);
    expect(await client.loginThrottle.count()).toBe(5);
    expect(await store.cleanupExpired(now)).toBe(5);
  });

  it("bounds each public namespace separately, so quote buckets cannot starve availability", async () => {
    const rows = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        key: `${prefix}:expired-${i}`,
        failures: 60,
        windowStartedAt: new Date(+start - 3_600_000),
        lockedUntil: null,
      }));
    await client.loginThrottle.createMany({
      data: [...rows("rl:quote", 1_003), ...rows("rl:availability", 4)],
    });
    // 1,000 from `quote` plus all 4 from `availability` in one run.
    expect(await store.cleanupExpired(now)).toBe(1_004);
    expect(await client.loginThrottle.count()).toBe(3);
    expect(await store.cleanupExpired(now)).toBe(3);
  });

  it("skips a competing admission and cannot reset its live bucket for 20 iterations", async () => {
    await withIndependentClients(2, async ([admitter, cleaner]) => {
      if (!admitter || !cleaner) throw new Error("Expected two clients.");
      for (let i = 0; i < 20; i += 1) {
        const bucket = key(`admission-first-${i}`);
        await expired(bucket);
        const held = deferred();
        const release = deferred();
        const admission = admitter.$transaction(async (tx) => {
          expect(
            await new PrismaPublicRateLimitStore(tx, clock).consume(
              bucket,
              rule,
            ),
          ).toEqual({ allowed: true });
          held.resolve();
          await release.promise;
        });
        try {
          await held.promise;
          expect(
            await new PrismaPublicRateLimitStore(cleaner, clock).cleanupExpired(
              now,
            ),
          ).toBe(0);
        } finally {
          release.resolve();
          await admission;
        }
        expect(await store.cleanupExpired(now)).toBe(0);
        expect(
          (
            await client.loginThrottle.findUniqueOrThrow({
              where: { key: bucket },
            })
          ).failures,
        ).toBe(1);
      }
    });
  });

  it("admits into a fresh bucket after waiting for cleanup deletion for 20 iterations", async () => {
    await withIndependentClients(3, async ([cleaner, admitter, observer]) => {
      if (!cleaner || !admitter || !observer)
        throw new Error("Expected three clients.");
      for (let i = 0; i < 20; i += 1) {
        const bucket = key(`cleanup-first-${i}`);
        await expired(bucket);
        const held = deferred();
        const release = deferred();
        const pid = deferred<number>();
        const cleaning = cleaner.$transaction(async (tx) => {
          expect(
            await new PrismaPublicRateLimitStore(tx, clock).cleanupExpired(now),
          ).toBe(1);
          held.resolve();
          await release.promise;
        });
        let admission: Promise<unknown> | undefined;
        try {
          await held.promise;
          admission = admitter.$transaction(async (tx) => {
            const [backend] = await tx.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid()::int AS pid`;
            if (!backend) throw new Error("Missing backend.");
            pid.resolve(backend.pid);
            return new PrismaPublicRateLimitStore(tx, clock).consume(
              bucket,
              rule,
            );
          });
          await waitForDatabaseLock(observer, await pid.promise);
        } finally {
          release.resolve();
          await cleaning;
          if (admission) expect(await admission).toEqual({ allowed: true });
        }
        expect(
          await client.loginThrottle.findUniqueOrThrow({
            where: { key: bucket },
          }),
        ).toMatchObject({ failures: 1, windowStartedAt: now });
      }
    });
  });

  it("samples admission time after waiting for a lock across expiry", async () => {
    await withIndependentClients(3, async ([holder, admitter, observer]) => {
      if (!holder || !admitter || !observer)
        throw new Error("Expected three clients.");
      await client.loginThrottle.create({
        data: {
          key: key(),
          failures: 60,
          windowStartedAt: start,
          lockedUntil: new Date(+start + 60_000),
        },
      });
      const held = deferred();
      const release = deferred();
      const pid = deferred<number>();
      const holding = holder.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "key" FROM "LoginThrottle" WHERE "key" = ${key()} FOR UPDATE`;
        held.resolve();
        await release.promise;
      });
      let admission: Promise<unknown> | undefined;
      try {
        await held.promise;
        admission = admitter.$transaction(async (tx) => {
          const [backend] = await tx.$queryRaw<
            { pid: number }[]
          >`SELECT pg_backend_pid()::int AS pid`;
          if (!backend) throw new Error("Missing backend.");
          pid.resolve(backend.pid);
          return new PrismaPublicRateLimitStore(tx, clock).consume(key(), rule);
        });
        await waitForDatabaseLock(observer, await pid.promise);
        now = new Date(+start + 60_000);
      } finally {
        release.resolve();
        await holding;
        if (admission) expect(await admission).toEqual({ allowed: true });
      }
      expect(
        (
          await client.loginThrottle.findUniqueOrThrow({
            where: { key: key() },
          })
        ).windowStartedAt,
      ).toEqual(now);
    });
  });
});

const exec = promisify(execFile);
const command = (args: string[], env: Partial<NodeJS.ProcessEnv> = {}) =>
  exec(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "--conditions=react-server",
      "scripts/throttles.mts",
      ...args,
    ],
    { cwd: process.cwd(), env: { ...process.env, ...env }, timeout: 15_000 },
  );

describe("throttles operator command (M6 AC-8)", () => {
  it("cleans expired rows against the real database and exits", async () => {
    await expired(key("cli"), {
      windowStartedAt: new Date("2000-01-01T00:00:00Z"),
      lockedUntil: null,
    });
    await expired("a:staff-cli");
    const { stdout, stderr } = await command(["cleanup-public"]);
    expect(JSON.parse(stdout)).toEqual({ deleted: 1 });
    expect(stderr).toBe("");
    expect(await client.loginThrottle.findMany()).toMatchObject([
      { key: "a:staff-cli" },
    ]);
  });

  it.each([[], ["unknown"], ["cleanup-public", "--all"]])(
    "rejects invalid arguments %j before database access",
    async (...args) => {
      await expect(
        command(args, {
          DATABASE_URL: "invalid",
          DIRECT_DATABASE_URL: "invalid",
        }),
      ).rejects.toMatchObject({
        code: 2,
        stderr: expect.stringContaining("Usage:"),
      });
    },
  );

  it("returns a nonzero status without database details on failure", async () => {
    await expect(
      command(["cleanup-public"], {
        DATABASE_URL:
          "postgresql://private-user:private-password@127.0.0.1:1/private-db",
        DIRECT_DATABASE_URL: "",
      }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: "Public throttle cleanup failed.\n",
      stdout: "",
    });
  });
});
