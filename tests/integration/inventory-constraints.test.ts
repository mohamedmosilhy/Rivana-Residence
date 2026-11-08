import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  actor,
  createActor,
  createBranch,
  createRoom,
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
let roomId: string;
let otherRoomId: string;
let foreignRoomId: string;
let sequence = 0;
const next = () => `inventory-${++sequence}`;

beforeAll(() => db.connect());
afterAll(async () => {
  await db.end();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDatabase(prisma);
  await createActor(prisma);
  roomId = (await createRoom(prisma)).id;
  otherRoomId = (await createRoom(prisma)).id;
  await createBranch(prisma, { id: "other-branch", slug: "other-branch" });
  foreignRoomId = (await createRoom(prisma, { branchId: "other-branch" })).id;
  await prisma.physicalRoom.create({
    data: {
      id: "unit",
      branchId: TEST_BRANCH_ID,
      roomTypeId: roomId,
      label: "101",
    },
  });
});

function block(
  from = "2027-01-10",
  to = "2027-01-14",
  cancelled = false,
  unit = "unit",
  branch = TEST_BRANCH_ID,
) {
  return db.query(
    `INSERT INTO "InventoryBlock" (id,"branchId","physicalRoomId","startDate","endDate",reason,"createdById","cancelledAt") VALUES ($1,$2,$3,$4,$5,'MAINTENANCE',$6,$7)`,
    [
      next(),
      branch,
      unit,
      from,
      to,
      actor.id,
      cancelled ? "2026-11-08T12:00:00Z" : null,
    ],
  );
}
function period(
  from = "2027-01-10",
  to = "2027-01-14",
  active = true,
  listing = roomId,
) {
  return db.query(
    `INSERT INTO "RatePeriod" (id,"roomTypeId","startDate","endDate","amountMinor",active,"updatedAt") VALUES ($1,$2,$3,$4,6000,$5,now())`,
    [next(), listing, from, to, active],
  );
}

describe("M6 database integrity (AC-2, AC-3, T-DB M6 subset)", () => {
  it("enforces branch-unique labels while allowing the same label in another branch", async () => {
    await expect(
      prisma.physicalRoom.create({
        data: {
          id: "duplicate",
          branchId: TEST_BRANCH_ID,
          roomTypeId: otherRoomId,
          label: "101",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await prisma.physicalRoom.create({
      data: {
        id: "foreign-unit",
        branchId: "other-branch",
        roomTypeId: foreignRoomId,
        label: "101",
      },
    });
  });

  it("rejects a unit whose listing belongs to another branch", async () => {
    await expect(
      db.query(
        `INSERT INTO "PhysicalRoom" (id,"branchId","roomTypeId",label,"updatedAt") VALUES ('wrong',$1,$2,'102',now())`,
        [TEST_BRANCH_ID, foreignRoomId],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "PhysicalRoom_roomTypeId_branchId_fkey",
    });
  });

  it("rejects a block whose unit belongs to another branch", async () => {
    await expect(
      block(undefined, undefined, false, "unit", "other-branch"),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "InventoryBlock_physicalRoomId_branchId_fkey",
    });
  });

  it("prevents moving an inventory-owned listing to another branch", async () => {
    await expect(
      db.query(`UPDATE "Room" SET "branchId"='other-branch' WHERE id=$1`, [
        roomId,
      ]),
    ).rejects.toMatchObject({
      code: "23001",
      constraint: "PhysicalRoom_roomTypeId_branchId_fkey",
    });
    expect(
      (await prisma.room.findUniqueOrThrow({ where: { id: roomId } })).branchId,
    ).toBe(TEST_BRANCH_ID);
  });

  it("prevents moving a blocked unit to another branch", async () => {
    await block();
    await expect(
      db.query(
        `UPDATE "PhysicalRoom" SET "branchId"='other-branch',"roomTypeId"=$1 WHERE id='unit'`,
        [foreignRoomId],
      ),
    ).rejects.toMatchObject({
      code: "23001",
      constraint: "InventoryBlock_physicalRoomId_branchId_fkey",
    });
  });

  it("restricts deleting inventory history but permits CMS archiving", async () => {
    await block();
    await expect(
      db.query(`DELETE FROM "PhysicalRoom" WHERE id='unit'`),
    ).rejects.toMatchObject({ code: "23001" });
    await expect(
      db.query(`DELETE FROM "Room" WHERE id=$1`, [roomId]),
    ).rejects.toMatchObject({ code: "23001" });
    await prisma.room.update({
      where: { id: roomId },
      data: { status: "ARCHIVED" },
    });
    expect(await prisma.inventoryBlock.count()).toBe(1);
  });

  it.each([
    ["2027-01-10", "2027-01-10"],
    ["2027-01-14", "2027-01-10"],
  ])("rejects invalid block and rate dates %s to %s", async (from, to) => {
    await expect(block(from, to)).rejects.toMatchObject({
      code: "23514",
      constraint: "InventoryBlock_dates_check",
    });
    await expect(period(from, to)).rejects.toMatchObject({
      code: "23514",
      constraint: "RatePeriod_dates_amount_currency_check",
    });
  });

  it.each([
    ["2027-01-09", "2027-01-11"],
    ["2027-01-11", "2027-01-13"],
    ["2027-01-13", "2027-01-15"],
    ["2027-01-09", "2027-01-15"],
    ["2027-01-10", "2027-01-14"],
  ])(
    "rejects overlapping blocks and active rates %s to %s",
    async (from, to) => {
      await block();
      await period();
      await expect(block(from, to)).rejects.toMatchObject({
        code: "23P01",
        constraint: "InventoryBlock_no_overlap",
      });
      await expect(period(from, to)).rejects.toMatchObject({
        code: "23P01",
        constraint: "RatePeriod_no_overlap",
      });
    },
  );

  it("permits adjacent blocks and periods at both boundaries", async () => {
    for (const [from, to] of [
      ["2027-01-10", "2027-01-14"],
      ["2027-01-08", "2027-01-10"],
      ["2027-01-14", "2027-01-16"],
    ] as const) {
      await block(from, to);
      await period(from, to);
    }
    expect(await prisma.inventoryBlock.count()).toBe(3);
    expect(await prisma.ratePeriod.count()).toBe(3);
  });

  it("permits overlaps on another unit or listing", async () => {
    await prisma.physicalRoom.create({
      data: {
        id: "second",
        branchId: TEST_BRANCH_ID,
        roomTypeId: roomId,
        label: "102",
      },
    });
    await block();
    await block(undefined, undefined, false, "second");
    await period();
    await period(undefined, undefined, true, otherRoomId);
    expect(await prisma.inventoryBlock.count()).toBe(2);
    expect(await prisma.ratePeriod.count()).toBe(2);
  });

  it("excludes cancelled blocks and inactive rates but checks reactivation", async () => {
    await block();
    await block(undefined, undefined, true);
    await period();
    await period(undefined, undefined, false);
    await expect(
      db.query(
        `UPDATE "InventoryBlock" SET "cancelledAt"=NULL WHERE "cancelledAt" IS NOT NULL`,
      ),
    ).rejects.toMatchObject({ code: "23P01" });
    await expect(
      db.query(`UPDATE "RatePeriod" SET active=true WHERE NOT active`),
    ).rejects.toMatchObject({ code: "23P01" });
  });

  it("checks block extensions and period edits, not just insertion", async () => {
    await block();
    await block("2027-01-14", "2027-01-16");
    await period();
    await period("2027-01-14", "2027-01-16");
    await expect(
      db.query(
        `UPDATE "InventoryBlock" SET "endDate"='2027-01-15' WHERE "endDate"='2027-01-14'`,
      ),
    ).rejects.toMatchObject({ code: "23P01" });
    await expect(
      db.query(
        `UPDATE "RatePeriod" SET "endDate"='2027-01-15' WHERE "endDate"='2027-01-14'`,
      ),
    ).rejects.toMatchObject({ code: "23P01" });
  });

  it.each(["RoomBaseRate", "RatePeriod"] as const)(
    "enforces positive USD INTEGER amounts in %s",
    async (table) => {
      const insert = (amount: number, currency: string) =>
        table === "RoomBaseRate"
          ? db.query(
              `INSERT INTO "RoomBaseRate" ("roomTypeId","amountMinor",currency,"updatedAt") VALUES ($1,$2,$3,now())`,
              [roomId, amount, currency],
            )
          : db.query(
              `INSERT INTO "RatePeriod" (id,"roomTypeId","startDate","endDate","amountMinor",currency,"updatedAt") VALUES ($1,$2,'2027-01-01','2027-01-02',$3,$4,now())`,
              [next(), roomId, amount, currency],
            );
      for (const amount of [0, -1])
        await expect(insert(amount, "USD")).rejects.toMatchObject({
          code: "23514",
        });
      await expect(insert(100, "EUR")).rejects.toMatchObject({ code: "23514" });
      await expect(insert(2147483648, "USD")).rejects.toMatchObject({
        code: "22003",
      });
      await insert(2147483647, "USD");
    },
  );

  it("requires existing staff references and a required block creator", async () => {
    await expect(
      db.query(
        `INSERT INTO "InventoryBlock" (id,"branchId","physicalRoomId","startDate","endDate",reason) VALUES ('no-creator',$1,'unit','2027-01-01','2027-01-02','OTHER')`,
        [TEST_BRANCH_ID],
      ),
    ).rejects.toMatchObject({ code: "23502" });
    await expect(
      db.query(
        `INSERT INTO "RoomBaseRate" ("roomTypeId","amountMinor","updatedById","updatedAt") VALUES ($1,100,'missing',now())`,
        [roomId],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("round trips DATE and millisecond timestamps through a UTC connection", async () => {
    await block("2028-02-29", "2028-03-01");
    const rows = await db.query(
      `SELECT "startDate"::text AS start,"endDate"::text AS end FROM "InventoryBlock"`,
    );
    expect(rows.rows).toEqual([{ start: "2028-02-29", end: "2028-03-01" }]);
    expect((await db.query("SHOW TimeZone")).rows[0]).toEqual({
      TimeZone: "UTC",
    });
    await db.query(
      `UPDATE "InventoryBlock" SET "createdAt"='2026-11-08T12:00:00.123Z'`,
    );
    expect(
      (await prisma.inventoryBlock.findFirstOrThrow()).createdAt.toISOString(),
    ).toBe("2026-11-08T12:00:00.123Z");
  });
});

describe("M6 exclusion constraint races (separate connections, 20 iterations)", () => {
  it.each(["block", "period"] as const)(
    "allows exactly one competing %s per iteration",
    async (kind) => {
      const clients = [0, 1].map(
        () =>
          new Client({
            connectionString: testDatabaseUrl().url,
            options: "-c TimeZone=UTC",
          }),
      );
      await Promise.all(clients.map((client) => client.connect()));
      try {
        for (let iteration = 0; iteration < 20; iteration++) {
          const from = `2027-03-${String(iteration + 1).padStart(2, "0")}`;
          const to = `2027-03-${String(iteration + 2).padStart(2, "0")}`;
          await Promise.all(clients.map((client) => client.query("BEGIN")));
          const results = await Promise.allSettled(
            clients.map(async (client, index) => {
              try {
                if (kind === "block")
                  await client.query(
                    `INSERT INTO "InventoryBlock" (id,"branchId","physicalRoomId","startDate","endDate",reason,"createdById") VALUES ($1,$2,'unit',$3,$4,'OTHER',$5)`,
                    [next(), TEST_BRANCH_ID, from, to, actor.id],
                  );
                else
                  await client.query(
                    `INSERT INTO "RatePeriod" (id,"roomTypeId","startDate","endDate","amountMinor","updatedAt") VALUES ($1,$2,$3,$4,100,now())`,
                    [next(), roomId, from, to],
                  );
                await client.query("COMMIT");
                return index;
              } catch (error) {
                await client.query("ROLLBACK");
                throw error;
              }
            }),
          );
          expect(
            results.filter((result) => result.status === "fulfilled"),
          ).toHaveLength(1);
          const failure = results.find(
            (result) => result.status === "rejected",
          );
          expect(failure?.status === "rejected" && failure.reason).toSatisfy(
            (reason: { code?: string; constraint?: string }) => {
              // Two uncommitted overlapping inserts wait on each other, so
              // PostgreSQL resolves the race as either the exclusion violation
              // or a detected deadlock. The reusable lock that avoids the
              // deadlock for blocks is M6-T4; periods are decided in M6-T7. Either way exactly one insert commits.
              const name =
                kind === "block"
                  ? "InventoryBlock_no_overlap"
                  : "RatePeriod_no_overlap";
              return (
                (reason.code === "23P01" && reason.constraint === name) ||
                reason.code === "40P01"
              );
            },
          );
        }
        const count =
          kind === "block"
            ? await prisma.inventoryBlock.count()
            : await prisma.ratePeriod.count();
        expect(count).toBe(20);
      } finally {
        await Promise.all(clients.map((client) => client.end()));
      }
    },
  );
});
