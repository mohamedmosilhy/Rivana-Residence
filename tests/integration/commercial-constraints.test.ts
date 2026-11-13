import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createActor,
  createBranch,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "./support/database";
import { testDatabaseUrl } from "./support/test-database";

const prisma = createTestClient();
const db = new Client({
  connectionString: testDatabaseUrl().url,
  options: "-c TimeZone=UTC",
});
let sequence = 0;
const next = () => `commercial-${++sequence}`;
beforeAll(() => db.connect());
afterAll(async () => {
  await db.end();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDatabase(prisma);
  await createActor(prisma);
});

const service = (
  price = 1000,
  child: number | null = null,
  unit = "PER_BOOKING",
  currency = "USD",
  branch = TEST_BRANCH_ID,
) =>
  db.query(
    `INSERT INTO "ServiceOffering" (id,"branchId",kind,"priceUnit","priceMinor","childPriceMinor",currency,"updatedAt") VALUES ($1,$2,'BREAKFAST',$3,$4,$5,$6,now())`,
    [next(), branch, unit, price, child, currency],
  );
const coupon = (
  code = next(),
  kind = "PERCENT",
  percent: number | null = 1000,
  amount: number | null = null,
) =>
  db.query(
    `INSERT INTO "Coupon" (id,code,kind,"percentBasisPoints","amountMinor","updatedAt") VALUES ($1,$2,$3,$4,$5,now()) RETURNING id`,
    [next(), code, kind, percent, amount],
  );

describe("M7 commercial persistence (AC-4 foundation, AC-7 storage)", () => {
  it("enforces one offering per branch and kind, and defaults to inactive USD", async () => {
    await service();
    expect(await prisma.serviceOffering.findFirstOrThrow()).toMatchObject({
      active: false,
      currency: "USD",
      childPriceMinor: null,
    });
    await expect(service()).rejects.toMatchObject({ code: "23505" });
    await createBranch(prisma, { id: "other", slug: "other" });
    await service(1000, null, "PER_BOOKING", "USD", "other");
    expect(await prisma.serviceOffering.count()).toBe(2);
  });
  it.each([0, -1])("rejects service price %s", async (amount) => {
    await expect(service(amount)).rejects.toMatchObject({
      code: "23514",
      constraint: "ServiceOffering_price_currency_check",
    });
  });
  it("requires an explicit supported service price unit", async () => {
    await expect(
      db.query(
        `INSERT INTO "ServiceOffering" (id,"branchId",kind,"priceMinor","updatedAt") VALUES ('missing-unit',$1,'BREAKFAST',100,now())`,
        [TEST_BRANCH_ID],
      ),
    ).rejects.toMatchObject({ code: "23502" });
    await expect(service(1000, null, "UNKNOWN")).rejects.toMatchObject({
      code: "22P02",
    });
  });
  it.each(["PER_BOOKING", "PER_NIGHT"])(
    "rejects child price for %s",
    async (unit) => {
      await expect(service(1000, 500, unit)).rejects.toMatchObject({
        code: "23514",
        constraint: "ServiceOffering_child_price_check",
      });
    },
  );
  it.each(["PER_PERSON", "PER_PERSON_PER_NIGHT"])(
    "accepts optional positive child price for %s",
    async (unit) => {
      for (const child of [0, -1])
        await expect(service(1000, child, unit)).rejects.toMatchObject({
          code: "23514",
        });
      await service(1000, 500, unit);
      await prisma.serviceOffering.deleteMany();
      await service(1000, null, unit);
    },
  );
  it("uses positive INTEGER USD prices", async () => {
    await expect(
      service(1000, null, "PER_BOOKING", "EUR"),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(service(2147483648)).rejects.toMatchObject({ code: "22003" });
    await service(2147483647);
    await coupon("MAX_FIXED", "FIXED", null, 2147483647);
    await expect(
      coupon("OVERFLOW", "FIXED", null, 2147483648),
    ).rejects.toMatchObject({ code: "22003" });
  });
  it.each([
    ["PERCENT", null, null],
    ["PERCENT", 0, null],
    ["PERCENT", 10001, null],
    ["PERCENT", 1000, 100],
    ["FIXED", null, null],
    ["FIXED", null, 0],
    ["FIXED", null, -1],
    ["FIXED", 1000, 100],
  ] as const)(
    "rejects invalid coupon value %s %s %s",
    async (kind, percent, amount) => {
      await expect(
        coupon(undefined, kind, percent, amount),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "Coupon_value_check",
      });
    },
  );
  it("round trips both coupon kinds and percentage boundaries", async () => {
    await coupon("ONE", "PERCENT", 1);
    await coupon("ALL", "PERCENT", 10000);
    await coupon("FIX", "FIXED", null, 1);
    expect(
      await prisma.coupon.findMany({ orderBy: { code: "asc" } }),
    ).toMatchObject([
      {
        code: "ALL",
        percentBasisPoints: 10000,
        amountMinor: null,
        currency: "USD",
        active: true,
        allBranches: false,
      },
      { code: "FIX", percentBasisPoints: null, amountMinor: 1 },
      { code: "ONE", percentBasisPoints: 1, amountMinor: null },
    ]);
  });
  it("T-CPN-7: rejects mixed case duplicate inserts and edits", async () => {
    await coupon("Summer_26");
    await expect(coupon("SUMMER_26")).rejects.toMatchObject({
      code: "23505",
      constraint: "Coupon_code_upper_key",
    });
    await coupon("OTHER");
    await expect(
      db.query(`UPDATE "Coupon" SET code='summer_26' WHERE code='OTHER'`),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "Coupon_code_upper_key",
    });
  });
  it("checks currency, windows and limits on edits while allowing open windows", async () => {
    const id = (await coupon()).rows[0].id as string;
    await expect(
      db.query(`UPDATE "Coupon" SET currency='EUR' WHERE id=$1`, [id]),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "Coupon_currency_check",
    });
    for (const end of ["2027-01-01", "2026-12-31"]) {
      await expect(
        db.query(
          `UPDATE "Coupon" SET "startsAt"='2027-01-01',"endsAt"=$2 WHERE id=$1`,
          [id, end],
        ),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "Coupon_dates_check",
      });
    }
    for (const column of ["maxRedemptions", "maxRedemptionsPerPhone"]) {
      for (const value of [0, -1])
        await expect(
          db.query(`UPDATE "Coupon" SET "${column}"=$2 WHERE id=$1`, [
            id,
            value,
          ]),
        ).rejects.toMatchObject({
          code: "23514",
          constraint: "Coupon_limits_check",
        });
    }
    await db.query(
      `UPDATE "Coupon" SET "startsAt"='2027-01-01',"endsAt"='2027-01-02',"maxRedemptions"=1,"maxRedemptionsPerPhone"=1 WHERE id=$1`,
      [id],
    );
    await db.query(`UPDATE "Coupon" SET "endsAt"=NULL WHERE id=$1`, [id]);
    await db.query(
      `UPDATE "Coupon" SET "startsAt"=NULL,"endsAt"='2027-01-02' WHERE id=$1`,
      [id],
    );
    expect(
      (await prisma.coupon.findUniqueOrThrow({ where: { id } })).maxRedemptions,
    ).toBe(1);
  });
  it("enforces branch joins, missing references, cascade and deletion restrictions", async () => {
    const id = (await coupon()).rows[0].id as string;
    await expect(
      service(1000, null, "PER_BOOKING", "USD", "missing"),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      prisma.couponBranch.create({
        data: { couponId: id, branchId: "missing" },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      prisma.couponBranch.create({
        data: { couponId: "missing", branchId: TEST_BRANCH_ID },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    await prisma.couponBranch.create({
      data: { couponId: id, branchId: TEST_BRANCH_ID },
    });
    await expect(
      prisma.couponBranch.create({
        data: { couponId: id, branchId: TEST_BRANCH_ID },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      db.query(`DELETE FROM "Branch" WHERE id=$1`, [TEST_BRANCH_ID]),
    ).rejects.toMatchObject({ code: "23001" });
    await prisma.coupon.delete({ where: { id } });
    expect(await prisma.couponBranch.count()).toBe(0);
    await service();
    await expect(
      db.query(`DELETE FROM "Branch" WHERE id=$1`, [TEST_BRANCH_ID]),
    ).rejects.toMatchObject({ code: "23001" });
  });
  it("restricts audit references to existing staff and preserves referenced staff", async () => {
    await service();
    const id = (await coupon()).rows[0].id as string;
    for (const [table, column] of [
      ["ServiceOffering", "updatedById"],
      ["Coupon", "createdById"],
      ["Coupon", "updatedById"],
      ["CommercialSettings", "updatedById"],
    ]) {
      await expect(
        db.query(`UPDATE "${table}" SET "${column}"='missing'`),
      ).rejects.toMatchObject({ code: "23503" });
    }
    await prisma.coupon.update({
      where: { id },
      data: { createdById: "actor-admin", updatedById: "actor-admin" },
    });
    await expect(
      db.query(`DELETE FROM "User" WHERE id='actor-admin'`),
    ).rejects.toMatchObject({ code: "23001" });
  });
  it("keeps one required VAT value, including 0 and 100 percent (AC-7)", async () => {
    expect(await prisma.commercialSettings.findMany()).toMatchObject([
      { id: "default", vatRateBasisPoints: 1500 },
    ]);
    for (const value of [0, 10000]) {
      await prisma.commercialSettings.update({
        where: { id: "default" },
        data: { vatRateBasisPoints: value },
      });
      expect(
        (
          await prisma.commercialSettings.findUniqueOrThrow({
            where: { id: "default" },
          })
        ).vatRateBasisPoints,
      ).toBe(value);
    }
    for (const value of [-1, 10001])
      await expect(
        db.query(`UPDATE "CommercialSettings" SET "vatRateBasisPoints"=$1`, [
          value,
        ]),
      ).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.query(`UPDATE "CommercialSettings" SET "vatRateBasisPoints"=NULL`),
    ).rejects.toMatchObject({ code: "23502" });
    await expect(
      db.query(
        `INSERT INTO "CommercialSettings" (id,"vatRateBasisPoints","updatedAt") VALUES ('other',1500,now())`,
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "CommercialSettings_singleton_check",
    });
    await expect(
      db.query(
        `INSERT INTO "CommercialSettings" (id,"vatRateBasisPoints","updatedAt") VALUES ('default',1500,now())`,
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });
});
