import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { expect, it } from "vitest";

import { insertStorage, reservationData } from "./support/reservation-storage";
import { testDatabaseUrl } from "./support/test-database";

const migration = "20261126130000_site_analytics";

it("upgrades a populated M9 database and enforces analytics constraints without Prisma drift", async () => {
  const url = new URL(testDatabaseUrl().url);
  const database = `rivana_m10_t0a_${randomUUID().slice(0, 8)}_test`;
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  url.pathname = `/${database}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    const db = new Client({
      connectionString: url.toString(),
      options: "-c TimeZone=UTC",
    });
    try {
      await db.connect();
      const directory = join(process.cwd(), "prisma/migrations");
      const apply = (name: string) =>
        db.query(readFileSync(join(directory, name, "migration.sql"), "utf8"));
      const migrations = readdirSync(directory)
        .filter((name) => /^\d/.test(name))
        .sort();
      for (const name of migrations.filter((name) => name < migration))
        await apply(name);

      await insertStorage(
        db,
        "Reservation",
        reservationData({ id: "desk", reference: "RR-00000001" }),
      );
      const before = (
        await db.query('SELECT * FROM "Reservation" WHERE id = $1', ["desk"])
      ).rows[0];
      await apply(migration);
      expect(
        (await db.query('SELECT * FROM "Reservation" WHERE id = $1', ["desk"]))
          .rows,
      ).toEqual([{ ...before, analyticsSessionId: null }]);
      await expect(
        db.query(
          'UPDATE "Reservation" SET "analyticsSessionId" = $1 WHERE id = $2',
          ["a".repeat(32), "desk"],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "Reservation_analyticsSessionId_check",
      });
      await expect(
        db.query('INSERT INTO "AnalyticsSalt" VALUES (CURRENT_DATE, $1)', [
          Buffer.alloc(31),
        ]),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "AnalyticsSalt_size_check",
      });
      for (const [values, constraint] of [
        [["UNKNOWN", "a".repeat(32), 1, "MOBILE"], "SiteEvent_name_check"],
        [["PAGE_VIEW", null, 1, "MOBILE"], "SiteEvent_sessionId_check"],
        [
          ["PAGE_VIEW", "a".repeat(32), 9, "MOBILE"],
          "SiteEvent_funnelStep_check",
        ],
        [["PAGE_VIEW", "a".repeat(32), 1, "OTHER"], "SiteEvent_device_check"],
      ] as const) {
        await expect(
          db.query(
            'INSERT INTO "SiteEvent" ("occurredAt", name, "sessionId", "funnelStep", device) VALUES (now(), $1, $2, $3, $4)',
            [...values],
          ),
        ).rejects.toMatchObject({ code: "23514", constraint });
      }
      await db.query(
        'INSERT INTO "SiteEvent" ("occurredAt", name, "stayCheckIn", "stayCheckOut") VALUES (now(), $1, $2, $3)',
        ["SEARCH", "2026-12-01", "2026-12-03"],
      );
      expect(
        (await db.query('SELECT "sessionId", "visitorHash" FROM "SiteEvent"'))
          .rows,
      ).toEqual([{ sessionId: null, visitorHash: null }]);

      const insertStep = (name: string, step: string | null) =>
        db.query(
          'INSERT INTO "SiteEvent" ("occurredAt", name, "sessionId", "bookingStep") VALUES (now(), $1, $2, $3)',
          [name, "a".repeat(32), step],
        );
      await insertStep("STEP_VIEW", "REVIEW");
      for (const [name, step] of [
        ["STEP_VIEW", null],
        ["STEP_VIEW", "INVALID"],
        ["PAGE_VIEW", "DETAILS"],
      ] as const) {
        await expect(insertStep(name, step)).rejects.toMatchObject({
          code: "23514",
          constraint: "SiteEvent_bookingStep_check",
        });
      }

      for (const name of migrations.filter((name) => name > migration))
        await apply(name);
      const result = execFileSync(
        "npx",
        [
          "prisma",
          "migrate",
          "diff",
          "--from-config-datasource",
          "--to-schema",
          "prisma/schema.prisma",
          "--exit-code",
        ],
        {
          env: {
            ...process.env,
            DATABASE_URL: url.toString(),
            DIRECT_DATABASE_URL: url.toString(),
          },
          encoding: "utf8",
        },
      );
      expect(result).toContain("No difference detected");
    } finally {
      await db.end();
    }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
});
