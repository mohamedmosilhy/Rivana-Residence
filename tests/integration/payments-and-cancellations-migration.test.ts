import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { expect, it } from "vitest";

import { insertStorage, reservationData } from "./support/reservation-storage";
import { testDatabaseUrl } from "./support/test-database";

const migration = "20261123120000_payments_and_cancellations";

it("M9-T1 upgrades populated M8, preserves reservations and enforces the renamed hold constraint without Prisma drift", async () => {
  const url = new URL(testDatabaseUrl().url);
  const database = `rivana_m9_t1_${randomUUID().slice(0, 8)}_test`;
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

      const hold = {
        status: "AWAITING_PAYMENT",
        paymentStatus: "AWAITING",
        holdExpiresAt: "2026-11-22T12:30:00Z",
      };
      await insertStorage(
        db,
        "Reservation",
        reservationData({ id: "hotel", reference: "RR-00000001" }),
      );
      // M8 did not create online bookings. This SQL fixture proves how the
      // existing enum value and its CHECK behave if an older row holds it.
      await insertStorage(
        db,
        "Reservation",
        reservationData({
          id: "legacy",
          reference: "RR-00000002",
          ...hold,
          paymentMethod: "PAYMOB",
        }),
      );
      const bookings = () =>
        db.query('SELECT * FROM "Reservation" ORDER BY id');
      const branches = () => db.query('SELECT * FROM "Branch" ORDER BY id');
      const beforeBookings = (await bookings()).rows;
      const beforeBranches = (await branches()).rows;

      await apply(migration);

      expect((await bookings()).rows).toEqual(
        beforeBookings.map((row) =>
          row.id === "legacy" ? { ...row, paymentMethod: "ONLINE" } : row,
        ),
      );
      expect((await branches()).rows).toEqual(
        beforeBranches.map((row) => ({ ...row, onlinePaymentEnabled: false })),
      );
      await expect(
        insertStorage(
          db,
          "Reservation",
          reservationData({ ...hold, paymentMethod: "PAYMOB" }),
        ),
      ).rejects.toMatchObject({ code: "22P02" });
      await expect(
        insertStorage(db, "Reservation", reservationData(hold)),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "Reservation_hold_check",
      });
      await expect(
        insertStorage(
          db,
          "Reservation",
          reservationData({
            ...hold,
            paymentMethod: "ONLINE",
            holdExpiresAt: null,
          }),
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "Reservation_hold_check",
      });
      await insertStorage(
        db,
        "Reservation",
        reservationData({ ...hold, paymentMethod: "ONLINE" }),
      );

      // Test T1 at its point in history, then compare the current schemas.
      for (const name of migrations.filter((name) => name > migration))
        await apply(name);
      expect(
        execFileSync(
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
        ),
      ).toContain("No difference detected");
    } finally {
      await db.end();
      await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    }
  } finally {
    await admin.end();
  }
});
