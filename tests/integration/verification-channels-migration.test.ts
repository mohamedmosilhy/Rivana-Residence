import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { expect, it } from "vitest";

import { insertStorage, reservationData } from "./support/reservation-storage";
import { testDatabaseUrl } from "./support/test-database";

const migration = "20261125130000_verification_channels";

// covers: M9-T12a migration (ADR 031, Q-99). Additive and safe for the
// previous release while it still runs during a deploy.
it("M9-T12a upgrades populated M9, backfills website bookings, and enforces the channel rules without Prisma drift", async () => {
  const url = new URL(testDatabaseUrl().url);
  const database = `rivana_m9_t12_${randomUUID().slice(0, 8)}_test`;
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

      const at = "2026-11-25T10:00:00Z";
      await insertStorage(db, "Guest", {
        id: "guest",
        phone: "+12025550101",
        name: "Fictional guest",
        phoneVerifiedAt: at,
        createdAt: at,
        updatedAt: at,
      });
      const website = {
        source: "WEBSITE",
        guestId: "guest",
        guestEmail: "guest@example.test",
        guestPhone: "+12025550101",
      };
      await insertStorage(
        db,
        "Reservation",
        reservationData({ id: "web", reference: "RR-00000001", ...website }),
      );
      await insertStorage(
        db,
        "Reservation",
        reservationData({ id: "desk", reference: "RR-00000002" }),
      );
      const verification = {
        id: "code",
        phone: "+12025550101",
        purpose: "BOOKING",
        codeHash: "0".repeat(64),
        expiresAt: at,
        clientKey: "client",
        createdAt: at,
      };
      await insertStorage(db, "PhoneVerification", verification);

      await apply(migration);

      const channels = await db.query(
        `SELECT id, "verificationChannel" FROM "Reservation" ORDER BY id`,
      );
      expect(channels.rows).toEqual([
        { id: "desk", verificationChannel: null },
        { id: "web", verificationChannel: "WHATSAPP" },
      ]);
      expect(
        (await db.query(`SELECT channel, email FROM "PhoneVerification"`)).rows,
      ).toEqual([{ channel: "WHATSAPP", email: null }]);
      expect(
        (await db.query(`SELECT "emailVerifiedAt" FROM "Guest"`)).rows,
      ).toEqual([{ emailVerifiedAt: null }]);
      // The Admin switch starts off (Q-99).
      expect(
        (
          await db.query(
            `SELECT id, "emailEnabled", "updatedById" FROM "VerificationSettings"`,
          )
        ).rows,
      ).toEqual([{ id: "default", emailEnabled: false, updatedById: null }]);

      // The previous release keeps working during a deploy: it writes no channel.
      await insertStorage(db, "PhoneVerification", {
        ...verification,
        id: "old-release-code",
      });
      await insertStorage(
        db,
        "Reservation",
        reservationData({
          id: "old-web",
          reference: "RR-00000003",
          ...website,
        }),
      );

      // The proven email goes with the EMAIL channel only, lowercased.
      await insertStorage(
        db,
        "Reservation",
        reservationData({
          id: "email-web",
          reference: "RR-00000005",
          ...website,
          verificationChannel: "EMAIL",
          verifiedEmail: "guest@example.test",
        }),
      );
      for (const [index, values] of [
        { verificationChannel: "EMAIL" },
        {
          verificationChannel: "WHATSAPP",
          verifiedEmail: "guest@example.test",
        },
        { verifiedEmail: "guest@example.test" },
        { verificationChannel: "EMAIL", verifiedEmail: "Guest@example.test" },
      ].entries())
        await expect(
          insertStorage(
            db,
            "Reservation",
            reservationData({
              id: `bad-web-${index}`,
              reference: `RR-0000010${index}`,
              ...website,
              ...values,
            }),
          ),
        ).rejects.toMatchObject({
          code: "23514",
          constraint: "Reservation_verified_email_check",
        });
      await insertStorage(db, "PhoneVerification", {
        ...verification,
        id: "email-code",
        channel: "EMAIL",
        email: "guest@example.test",
      });
      for (const values of [
        { channel: "EMAIL" },
        { channel: "WHATSAPP", email: "guest@example.test" },
        { channel: "EMAIL", email: "Guest@example.test" },
      ])
        await expect(
          insertStorage(db, "PhoneVerification", {
            ...verification,
            id: `bad-${randomUUID().slice(0, 8)}`,
            ...values,
          }),
        ).rejects.toMatchObject({
          code: "23514",
          constraint: "PhoneVerification_channel_email_check",
        });
      await expect(
        insertStorage(
          db,
          "Reservation",
          reservationData({
            id: "desk-email",
            reference: "RR-00000004",
            verificationChannel: "EMAIL",
          }),
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "Reservation_verification_channel_check",
      });

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
