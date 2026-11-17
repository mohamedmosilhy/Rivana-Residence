import { PrismaInventoryLock } from "@/infrastructure/db/prisma/repositories/reservations/inventory/inventory-lock";
import {
  deferred,
  waitForDatabaseLock,
  withIndependentClients,
} from "./support/concurrency";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaReservationRepository } from "@/infrastructure/db/prisma/repositories/reservations/reservation-repository";
import { PrismaReservationConsumptionReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/reservation-consumption-reader";
import {
  createActor,
  createBranch,
  createRoom,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import {
  local,
  range,
  reservationInput,
} from "./support/reservation-repositories";
import { physicalRoomUseCase } from "./support/physical-rooms";
import { blockUseCase } from "./support/blocks";

const client = createTestClient();
const reader = new PrismaReservationConsumptionReader(client);
const repository = new PrismaReservationRepository(client);
let roomId: string;
const admin = {
  id: "actor-admin",
  role: "ADMIN" as const,
  name: "Admin",
  email: "admin@example.test",
  sessionId: "session",
  branchIds: [],
};
beforeEach(async () => {
  await resetDatabase(client);
  await createActor(client);
  roomId = (await createRoom(client)).id;
  await client.physicalRoom.create({
    data: {
      id: "assigned-unit",
      branchId: TEST_BRANCH_ID,
      roomTypeId: roomId,
      label: "A",
    },
  });
});
afterAll(() => client.$disconnect());
async function insert(input = reservationInput(roomId)) {
  const result = await repository.insert(input);
  expect(result.ok).toBe(true);
  return input;
}
const sold = (
  nights = ["2031-07-03", "2031-07-04", "2031-07-05", "2031-07-06"],
  ids = [roomId],
  branchId = TEST_BRANCH_ID,
) =>
  reader.readSoldOnDates({
    branchId,
    roomTypeIds: ids,
    nights: nights.map(local),
  });

describe("persisted reservation consumption", () => {
  it("counts each room line once, deduplicates requested dates and excludes checkout", async () => {
    const input = reservationInput(roomId);
    await insert({
      ...input,
      lines: [input.lines[0]!, { ...input.lines[0]!, id: "second-unit" }],
    });
    expect(
      await sold(
        ["2031-07-06", "2031-07-04", "2031-07-04", "2031-07-03", "2031-07-05"],
        [roomId, roomId],
      ),
    ).toEqual([
      { roomTypeId: roomId, night: local("2031-07-04"), sold: 2 },
      { roomTypeId: roomId, night: local("2031-07-05"), sold: 2 },
    ]);
    expect(await sold([], [roomId])).toEqual([]);
    expect(await sold(undefined, [])).toEqual([]);
  });

  it.each([
    "CONFIRMED",
    "CHECKED_IN",
    "CHECKED_OUT",
    "CANCELLED",
    "NO_SHOW",
    "PAYMENT_FAILED",
  ] as const)("honors stored consumption for %s", async (status) => {
    const input = reservationInput(roomId, { status });
    await insert({
      ...input,
      lines: input.lines.map((line) => ({
        ...line,
        physicalRoomId: "assigned-unit",
      })),
    });
    const consuming = ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"].includes(
      status,
    );
    expect((await sold()).length).toBe(consuming ? 2 : 0);
    expect(
      (
        await reader.readAssignments({
          branchId: TEST_BRANCH_ID,
          physicalRoomId: "assigned-unit",
          window: { kind: "FROM", from: local("2031-07-04") },
        })
      ).length,
    ).toBe(consuming ? 1 : 0);
  });

  it("isolates branch and listing reads", async () => {
    await insert();
    await createBranch(client, { id: "foreign", slug: "foreign" });
    const foreign = await createRoom(client, { branchId: "foreign" });
    await insert(reservationInput(foreign.id, { branchId: "foreign" }));
    expect(await sold(undefined, [roomId, foreign.id])).toHaveLength(2);
    expect(await sold(undefined, [roomId], "foreign")).toEqual([]);
    expect(
      await reader.readFutureSold({
        branchId: "foreign",
        roomTypeId: roomId,
        from: local("2031-01-01"),
      }),
    ).toEqual([]);
    expect(
      await reader.readAssignments({
        branchId: "foreign",
        physicalRoomId: "assigned-unit",
        window: { kind: "FROM", from: local("2031-01-01") },
      }),
    ).toEqual([]);
  });

  it("returns sparse future sold dates beyond the public horizon and clips at from", async () => {
    await insert();
    await insert(
      reservationInput(roomId, { stay: range("2041-07-04", "2041-07-06") }),
    );
    expect(
      await reader.readFutureSold({
        branchId: TEST_BRANCH_ID,
        roomTypeId: roomId,
        from: local("2031-07-05"),
      }),
    ).toEqual([
      { roomTypeId: roomId, night: local("2031-07-05"), sold: 1 },
      { roomTypeId: roomId, night: local("2041-07-04"), sold: 1 },
      { roomTypeId: roomId, night: local("2041-07-05"), sold: 1 },
    ]);
  });

  it("uses the shortened operational stay while retaining the original financial nights", async () => {
    const original = reservationInput(roomId, { status: "CHECKED_OUT" });
    const input = await insert({
      ...original,
      stay: range("2031-07-04", "2031-07-05"),
    });
    expect(await client.reservationNight.count()).toBe(2);
    expect(await sold()).toEqual([
      { roomTypeId: roomId, night: local("2031-07-04"), sold: 1 },
    ]);
    expect(await repository.findById(TEST_BRANCH_ID, input.id)).toMatchObject({
      snapshot: input.snapshot,
      lines: [{ nights: input.lines[0]!.nights }],
    });
  });

  it("treats assignment windows as half open and returns whole operational ranges", async () => {
    const input = reservationInput(roomId);
    await insert({
      ...input,
      lines: input.lines.map((line) => ({
        ...line,
        physicalRoomId: "assigned-unit",
      })),
    });
    const assignments = (start: string, end: string) =>
      reader.readAssignments({
        branchId: TEST_BRANCH_ID,
        physicalRoomId: "assigned-unit",
        window: { kind: "INTERSECTING", range: range(start, end) },
      });
    expect(await assignments("2031-07-03", "2031-07-04")).toEqual([]);
    expect(await assignments("2031-07-06", "2031-07-07")).toEqual([]);
    expect(await assignments("2031-07-05", "2031-07-07")).toEqual([input.stay]);
    expect(
      await reader.readAssignments({
        branchId: TEST_BRANCH_ID,
        physicalRoomId: "assigned-unit",
        window: { kind: "FROM", from: local("2031-07-06") },
      }),
    ).toEqual([]);
  });

  it("prevents deactivation and a block from reducing capacity below persisted unassigned sales", async () => {
    await insert();
    const options = { clock: () => new Date("2031-07-01T10:00:00Z") };
    expect(
      await physicalRoomUseCase(client, options).update(
        admin,
        "assigned-unit",
        { active: false },
      ),
    ).toMatchObject({ ok: false, error: { code: "INVENTORY_UNAVAILABLE" } });
    expect(
      await blockUseCase(client, options).create(admin, TEST_BRANCH_ID, {
        physicalRoomId: "assigned-unit",
        startDate: "2031-07-04",
        endDate: "2031-07-06",
        reason: "MAINTENANCE",
      }),
    ).toMatchObject({ ok: false, error: { code: "INVENTORY_UNAVAILABLE" } });
    expect(await client.inventoryBlock.count()).toBe(0);
    expect(
      (
        await client.physicalRoom.findUniqueOrThrow({
          where: { id: "assigned-unit" },
        })
      ).active,
    ).toBe(true);
  });
});

it("a reduction waiting for the listing lock sees the committed sale, 20 observed waits", async () => {
  await withIndependentClients(2, async ([first, second]) => {
    if (!first || !second) throw new Error("Missing independent clients");
    for (let index = 0; index < 20; index++) {
      const ready = deferred();
      const release = deferred();
      const pid = deferred<number>();
      const input = reservationInput(roomId);
      const bookingWrite = first.$transaction(
        async (tx) => {
          expect(
            (
              await new PrismaInventoryLock(tx).lockRoomTypes(TEST_BRANCH_ID, [
                roomId,
              ])
            ).ok,
          ).toBe(true);
          expect(
            (await new PrismaReservationRepository(tx).insert(input)).ok,
          ).toBe(true);
          ready.resolve();
          await release.promise;
        },
        { timeout: 15000 },
      );
      await ready.promise;
      const reduction = physicalRoomUseCase(second, {
        clock: () => new Date("2031-07-01T10:00:00Z"),
        onBackend: (value) => pid.resolve(value),
      }).update(admin, "assigned-unit", { active: false });
      try {
        await waitForDatabaseLock(client, await pid.promise);
      } finally {
        release.resolve();
      }
      await bookingWrite;
      expect(await reduction).toMatchObject({
        ok: false,
        error: { code: "INVENTORY_UNAVAILABLE" },
      });
      expect(await sold()).toHaveLength(2);
      expect(
        (
          await client.physicalRoom.findUniqueOrThrow({
            where: { id: "assigned-unit" },
          })
        ).active,
      ).toBe(true);
      expect(await client.auditEvent.count()).toBe(0);
      await client.reservation.delete({ where: { id: input.id } });
    }
  });
});
