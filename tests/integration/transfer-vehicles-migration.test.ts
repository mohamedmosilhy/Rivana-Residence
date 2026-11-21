import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { expect, it } from "vitest";
import { testDatabaseUrl } from "./support/test-database";
import { insertStorage, reservationData } from "./support/reservation-storage";
import { TEST_BRANCH_ID } from "./support/database";

it("upgrades populated M8 storage, preserves monetary history, enforces car constraints and has no Prisma drift", async () => {
  const base = testDatabaseUrl();
  const scratch = new URL(base.url);
  scratch.pathname =
    "/" + base.database.replace(/_test$/, "_vehicles_upgrade_test");
  const adminUrl = new URL(base.url);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  const db = new Client({
    connectionString: scratch.toString(),
    options: "-c TimeZone=UTC",
  });
  await admin.connect();
  const database = scratch.pathname.slice(1);
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${database}"`);
  try {
    await db.connect();
    const directory = join(process.cwd(), "prisma/migrations");
    const externalChannelMigration =
      "20261121120000_reservation_external_channel";
    const changesMigration = "20261122120000_reservation_changes";
    const names = readdirSync(directory)
      .filter((name) => /^\d/.test(name))
      .sort();
    for (const name of names.filter((name) => name < "20261117"))
      await db.query(
        readFileSync(join(directory, name, "migration.sql"), "utf8"),
      );
    await insertStorage(db, "ServiceOffering", {
      id: "old-transfer",
      branchId: TEST_BRANCH_ID,
      kind: "AIRPORT_TRANSFER",
      priceUnit: "PER_BOOKING",
      priceMinor: 4000,
      active: true,
      updatedAt: new Date("2026-11-16T00:00:00Z"),
    });
    await insertStorage(db, "ServiceOffering", {
      id: "old-breakfast",
      branchId: TEST_BRANCH_ID,
      kind: "BREAKFAST",
      priceUnit: "PER_PERSON",
      priceMinor: 1000,
      active: true,
      updatedAt: new Date("2026-11-16T00:00:00Z"),
    });
    const booking = reservationData({
      id: "old-reservation",
      reference: "RR-00000001",
    });
    await insertStorage(db, "Reservation", booking);
    await insertStorage(db, "ReservationService", {
      reservationId: booking.id,
      kind: "AIRPORT_TRANSFER",
      priceUnit: "PER_BOOKING",
      priceMinor: 4000,
      adults: 2,
      children: 0,
      nights: 2,
      adultQuantity: 1,
      childQuantity: 0,
      amountMinor: 4000,
      details: "Old flight",
    });
    const before = {
      offerings: (await db.query(`SELECT * FROM "ServiceOffering" ORDER BY id`))
        .rows,
      service: (await db.query(`SELECT * FROM "ReservationService"`)).rows,
      booking: (await db.query(`SELECT * FROM "Reservation"`)).rows,
    };
    for (const name of names.filter(
      (name) => name >= "20261117" && name < externalChannelMigration,
    ))
      await db.query(
        readFileSync(join(directory, name, "migration.sql"), "utf8"),
      );
    const afterOfferings = (
      await db.query(`SELECT * FROM "ServiceOffering" ORDER BY id`)
    ).rows;
    // Every earlier column is unchanged; transfers get 3 cars, breakfast null.
    expect(afterOfferings).toEqual(
      before.offerings.map((row) => ({
        ...row,
        maxVehicles: row.kind === "AIRPORT_TRANSFER" ? 3 : null,
      })),
    );
    const afterServices = (await db.query(`SELECT * FROM "ReservationService"`))
      .rows;
    // Recorded prices and totals are untouched; the transfer snapshot is 1 car.
    expect(afterServices).toEqual(
      before.service.map((row) => ({ ...row, vehicles: 1 })),
    );
    expect((await db.query(`SELECT * FROM "Reservation"`)).rows).toEqual(
      before.booking,
    );
    for (const value of [0, 11, null]) {
      await expect(
        db.query(
          `UPDATE "ServiceOffering" SET "maxVehicles"=$1 WHERE id='old-transfer'`,
          [value],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        db.query(`UPDATE "ReservationService" SET vehicles=$1`, [value]),
      ).rejects.toMatchObject({ code: "23514" });
    }
    await expect(
      db.query(
        `UPDATE "ServiceOffering" SET "maxVehicles"=2 WHERE id='old-breakfast'`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.query(
        `UPDATE "ServiceOffering" SET "priceUnit"='PER_VEHICLE' WHERE id='old-breakfast'`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await db.query(
      `UPDATE "ServiceOffering" SET "priceUnit"='PER_VEHICLE' WHERE id='old-transfer'`,
    );
    await expect(
      db.query(
        `UPDATE "ServiceOffering" SET "childPriceMinor"=100 WHERE id='old-transfer'`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await db.query(
      `UPDATE "ReservationService" SET "priceUnit"='PER_VEHICLE', vehicles=2, "adultQuantity"=2, "amountMinor"=8000`,
    );
    await expect(
      db.query(`UPDATE "ReservationService" SET "adultQuantity"=1`),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.query(`UPDATE "ReservationService" SET kind='BREAKFAST'`),
    ).rejects.toMatchObject({ code: "23514" });
    // M8-T8 adds nullable metadata. The upgrade preserves an existing
    // reservation, including its recorded prices, with no inferred channel.
    for (const name of names.filter(
      (name) => name >= externalChannelMigration && name < changesMigration,
    ))
      await db.query(
        readFileSync(join(directory, name, "migration.sql"), "utf8"),
      );
    expect((await db.query(`SELECT * FROM "Reservation"`)).rows).toEqual(
      before.booking.map((row) => ({ ...row, externalChannel: null })),
    );
    // M8-T9 adds the change sequence, the pending flag, and the history table.
    for (const name of names.filter((name) => name >= changesMigration))
      await db.query(
        readFileSync(join(directory, name, "migration.sql"), "utf8"),
      );
    expect((await db.query(`SELECT * FROM "Reservation"`)).rows).toEqual(
      before.booking.map((row) => ({
        ...row,
        externalChannel: null,
        changeSeq: 0,
        pmsUpdatePendingSince: null,
      })),
    );
    const change = (overrides: string, values: unknown[]) =>
      db.query(
        `INSERT INTO "ReservationChange" (id,"reservationId","branchId",seq,kind,"actorType",before,after${overrides.split("|")[0]}) VALUES ($1,'old-reservation',$2,$3,'STAY','STAFF','{}','{}'${overrides.split("|")[1]})`,
        values,
      );
    await change("|", ["c1", TEST_BRANCH_ID, 1]);
    await expect(change("|", ["c1b", TEST_BRANCH_ID, 1])).rejects.toMatchObject(
      { code: "23505" },
    );
    await expect(change("|", ["c0", TEST_BRANCH_ID, 0])).rejects.toMatchObject({
      code: "23514",
    });
    await expect(change("|", ["cx", "other-branch", 2])).rejects.toMatchObject({
      code: "23503",
    });
    // Override fields are all or none, and the reason cannot be blank.
    await expect(
      change(',"overrideFromMinor"|,100', ["c2", TEST_BRANCH_ID, 2]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      change(
        ',"overrideFromMinor","overrideToMinor","overrideReason"|,100,90,\' \'',
        ["c3", TEST_BRANCH_ID, 3],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await change(
      ',"overrideFromMinor","overrideToMinor","overrideReason"|,100,90,\'Goodwill\'',
      ["c4", TEST_BRANCH_ID, 4],
    );
    // The pending flag needs a hotel-system entry.
    await expect(
      db.query(`UPDATE "Reservation" SET "pmsUpdatePendingSince"=now()`),
    ).rejects.toMatchObject({ code: "23514" });
    const output = execFileSync(
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
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: scratch.toString(),
          DIRECT_DATABASE_URL: scratch.toString(),
        },
      },
    );
    expect(output).toContain("No difference detected");
  } finally {
    await db.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
}, 60000);
