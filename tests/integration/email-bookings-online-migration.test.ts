import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { expect, it } from "vitest";

import { insertStorage, reservationData } from "./support/reservation-storage";
import { testDatabaseUrl } from "./support/test-database";

const migration = "20261126120000_email_bookings_online_only";

// covers: M9-T12c migration (Q-100). An email verified booking is paid online;
// rows written before the migration are left as they are.
it("M9-T12c upgrades populated M9 and refuses a new or updated email booking that is not paid online, without Prisma drift", async () => {
  const url = new URL(testDatabaseUrl().url);
  const database = `rivana_m9_t12c_${randomUUID().slice(0, 8)}_test`;
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

      const at = "2026-11-26T10:00:00Z";
      await insertStorage(db, "Guest", {
        id: "guest",
        phone: "+12025550101",
        name: "Fictional guest",
        createdAt: at,
        updatedAt: at,
      });
      const website = {
        source: "WEBSITE",
        guestId: "guest",
        guestEmail: "guest@example.test",
        guestPhone: "+12025550101",
      };
      const email = {
        ...website,
        verificationChannel: "EMAIL",
        verifiedEmail: "guest@example.test",
      };
      const insert = (id: string, number: number, values: object) =>
        insertStorage(
          db,
          "Reservation",
          reservationData({
            id,
            reference: `RR-0000000${number}`,
            ...values,
          }),
        );
      // Written before the rule existed (a local database only).
      await insert("earlier", 1, { ...email, paymentMethod: "PAY_AT_HOTEL" });

      await apply(migration);

      await insert("online", 2, {
        ...email,
        paymentMethod: "ONLINE",
        paymentStatus: "PAID",
      });
      await insert("whatsapp", 3, {
        ...website,
        verificationChannel: "WHATSAPP",
        paymentMethod: "PAY_AT_HOTEL",
      });
      await insert("older-website", 4, {
        ...website,
        paymentMethod: "PAY_AT_HOTEL",
      });
      await insert("desk", 5, { paymentMethod: "PAY_AT_HOTEL" });
      const refused = {
        code: "23514",
        constraint: "Reservation_email_online_check",
      };
      await expect(
        insert("bad", 6, { ...email, paymentMethod: "PAY_AT_HOTEL" }),
      ).rejects.toMatchObject(refused);
      await expect(
        db.query(
          `UPDATE "Reservation" SET "paymentMethod" = 'PAY_AT_HOTEL', "paymentStatus" = 'NOT_REQUIRED' WHERE id = 'online'`,
        ),
      ).rejects.toMatchObject(refused);
      // NOT VALID: the earlier row stays, but any new write to it is checked.
      expect(
        (
          await db.query(
            `SELECT "paymentMethod" FROM "Reservation" WHERE id = 'earlier'`,
          )
        ).rows,
      ).toEqual([{ paymentMethod: "PAY_AT_HOTEL" }]);

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
