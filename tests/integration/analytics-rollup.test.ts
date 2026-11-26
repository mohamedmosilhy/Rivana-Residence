import { spawnSync } from "node:child_process";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANALYTICS_ROLLUP_LOCK_KEY,
  runSiteEventRollupOn,
} from "@/composition/analytics-jobs";
import { runWithJobLock } from "@/infrastructure/db/prisma/job-lock";
import { PrismaSiteRollupStore } from "@/infrastructure/db/prisma/repositories/analytics/site-analytics-store";

import { deferred } from "./reservations/support/concurrency";
import {
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "./support/database";
import { testDatabaseUrl } from "./support/test-database";

// M10-T0b, T-ANL-9 and T-ANL-10: daily totals and 90 day deletion.
const client = createTestClient();
const now = new Date("2031-03-10T01:00:00Z");
const clock = { now: () => now };
const DAY = 24 * 60 * 60_000;
const ago = (ms: number) => new Date(now.getTime() - ms);

let sequence = 0;
function view(occurredAt: Date | string, values: Record<string, unknown> = {}) {
  sequence += 1;
  return client.siteEvent.create({
    data: {
      occurredAt: new Date(occurredAt),
      name: "PAGE_VIEW",
      funnelStep: 1,
      path: "/{branch}",
      branchId: TEST_BRANCH_ID,
      sessionId: sequence.toString(16).padStart(32, "0"),
      visitorHash: "a".repeat(32),
      ...values,
    },
  });
}

const totals = () =>
  client.siteDailyTotal.findMany({
    orderBy: [
      { date: "asc" },
      { branchId: "asc" },
      { dimension: "asc" },
      { key: "asc" },
    ],
  });
const siteDays = async () =>
  (await totals())
    .filter((row) => row.branchId === "*" && row.dimension === "TOTAL")
    .map((row) => [row.date.toISOString().slice(0, 10), row.sessions]);

beforeEach(() => resetDatabase(client));
afterAll(() => client.$disconnect());

describe("rollup and retention", () => {
  it("totals every finished day, leaves today, and gives the same rows when run again", async () => {
    await view("2031-03-05T10:00:00Z");
    await view("2031-03-09T23:59:59.999Z");
    await view("2031-03-10T00:00:00Z");
    await view("2031-03-09T12:00:00Z", {
      name: "SEARCH",
      funnelStep: null,
      path: null,
      sessionId: null,
      visitorHash: null,
      outcome: "NO_AVAILABILITY",
      stayCheckIn: new Date("2031-04-01T00:00:00Z"),
      stayCheckOut: new Date("2031-04-03T00:00:00Z"),
    });

    expect(await runSiteEventRollupOn(client, clock)).toEqual({
      rolledUpDays: 2,
      failedDays: 0,
      deletedEvents: 0,
    });
    const first = await totals();
    expect(await siteDays()).toEqual([
      ["2031-03-05", 1],
      ["2031-03-09", 1],
    ]);
    expect(first.filter((row) => row.dimension === "UNMET_DATE")).toHaveLength(
      4,
    );
    expect(
      first.find(
        (row) =>
          row.branchId === TEST_BRANCH_ID &&
          row.dimension === "EXIT_PAGE" &&
          row.date.toISOString().startsWith("2031-03-09"),
      ),
    ).toMatchObject({ key: "/{branch}", sessions: 1, visitors: 1, count: 1 });

    // Only the recent day is counted again; the older one is final.
    expect(await runSiteEventRollupOn(client, clock)).toMatchObject({
      rolledUpDays: 1,
    });
    expect(await totals()).toEqual(first);
    expect(await client.siteEvent.count()).toBe(4);
  });

  it("counts a late event again for the last two finished days only", async () => {
    await view("2031-03-07T10:00:00Z");
    await view("2031-03-08T10:00:00Z");
    await runSiteEventRollupOn(client, clock);
    await view("2031-03-07T11:00:00Z");
    await view("2031-03-08T11:00:00Z");
    await runSiteEventRollupOn(client, clock);
    expect(await siteDays()).toEqual([
      ["2031-03-07", 1],
      ["2031-03-08", 2],
    ]);
  });

  it("counts a visit across midnight once and finishes a day that holds only its tail", async () => {
    const session = { sessionId: "f".repeat(32) };
    await view("2031-03-06T23:50:00Z", session);
    await view("2031-03-07T00:05:00Z", session);
    await runSiteEventRollupOn(client, clock);
    expect(await siteDays()).toEqual([
      ["2031-03-06", 1],
      ["2031-03-07", 0],
    ]);
  });

  it("deletes raw events older than 90 days only after their totals exist, and keeps the totals", async () => {
    await view(ago(91 * DAY));
    await view(ago(90 * DAY + 1));
    await view(ago(90 * DAY - 60_000));
    expect(await runSiteEventRollupOn(client, clock)).toEqual({
      rolledUpDays: 2,
      failedDays: 0,
      deletedEvents: 2,
    });
    expect(await client.siteEvent.count()).toBe(1);
    const kept = await totals();
    expect((await siteDays()).map(([, sessions]) => sessions)).toEqual([1, 2]);
    // The deleted days are never recounted from nothing.
    await runSiteEventRollupOn(client, clock);
    expect(await totals()).toEqual(kept);
  });

  it("keeps the events of a day that failed, finishes the others, and recovers", async () => {
    await view(ago(100 * DAY));
    await view(ago(95 * DAY));
    const failing = ago(100 * DAY)
      .toISOString()
      .slice(0, 10);
    const original = PrismaSiteRollupStore.prototype.replaceTotals;
    const replace = vi
      .spyOn(PrismaSiteRollupStore.prototype, "replaceTotals")
      .mockImplementation(function (this: PrismaSiteRollupStore, day, rows) {
        if (day === failing) return Promise.reject(new Error("write failed"));
        return original.call(this, day, rows);
      });
    try {
      expect(await runSiteEventRollupOn(client, clock)).toEqual({
        rolledUpDays: 1,
        failedDays: 1,
        deletedEvents: 1,
      });
      expect(await client.siteEvent.count()).toBe(1);
    } finally {
      replace.mockRestore();
    }
    expect(await runSiteEventRollupOn(client, clock)).toEqual({
      rolledUpDays: 1,
      failedDays: 0,
      deletedEvents: 1,
    });
    expect(await client.siteEvent.count()).toBe(0);
  });

  it("replaces a day's totals atomically", async () => {
    const store = new PrismaSiteRollupStore(client);
    const row = {
      branchId: "*",
      dimension: "TOTAL" as const,
      key: "",
      visitors: 1,
      sessions: 1,
      count: 1,
    };
    await store.replaceTotals("2031-03-01", [row]);
    await expect(
      store.replaceTotals("2031-03-01", [row, row]),
    ).rejects.toThrow();
    expect(await client.siteDailyTotal.findMany()).toHaveLength(1);
  });

  it("replaces yesterday's visitor secret even on a day without visits", async () => {
    await client.analyticsSalt.create({
      data: { day: new Date("2031-03-09T00:00:00Z"), salt: Buffer.alloc(32) },
    });
    await runSiteEventRollupOn(client, clock);
    expect(
      await client.analyticsSalt.findMany({ select: { day: true } }),
    ).toEqual([{ day: new Date("2031-03-10T00:00:00Z") }]);
    expect(await totals()).toEqual([]);
  });

  it("never overlaps a running rollup, over 20 held lock rounds", async () => {
    const second = createTestClient();
    await view("2031-03-09T10:00:00Z");
    try {
      for (let round = 0; round < 20; round += 1) {
        await client.siteDailyTotal.deleteMany();
        const held = deferred();
        const release = deferred();
        const running = runWithJobLock(
          client,
          ANALYTICS_ROLLUP_LOCK_KEY,
          async () => {
            held.resolve();
            await release.promise;
          },
        );
        await Promise.race([held.promise, running]);
        try {
          expect(await runSiteEventRollupOn(second, clock)).toEqual({
            skipped: "ALREADY_RUNNING",
          });
          expect(await second.siteDailyTotal.count()).toBe(0);
        } finally {
          release.resolve();
          await running;
        }
        expect(await runSiteEventRollupOn(second, clock)).toMatchObject({
          rolledUpDays: 1,
        });
      }
    } finally {
      await second.$disconnect();
    }
  });
});

describe("npm run analytics", () => {
  const run = (...args: string[]) =>
    spawnSync("npm", ["run", "--silent", "analytics", "--", ...args], {
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl().url,
        DIRECT_DATABASE_URL: testDatabaseUrl().url,
        // Retention runs even while collection is switched off.
        ANALYTICS_ENABLED: "false",
      },
      encoding: "utf8",
    });

  it("rolls up and deletes, printing counts only", async () => {
    await view("2020-01-01T10:00:00Z");
    const result = run("rollup");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      rolledUpDays: 1,
      failedDays: 0,
      deletedEvents: 1,
    });
  });

  it("refuses an unknown command", () => {
    const result = run("purge");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Usage: npm run analytics -- rollup");
  });
});
