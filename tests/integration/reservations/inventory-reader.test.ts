import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type {
  ReservationConsumptionReader,
  SoldNightContribution,
} from "@/application/inventory";
import { LocalDate } from "@/domain/shared/local-date";
import { EmptyReservationConsumptionReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/empty-reservation-consumption-reader";
import { PrismaInventoryReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/inventory-reader";

import {
  actor,
  createActor,
  createBranch,
  createRoom,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";

const prisma = createTestClient();
const nights = ["2027-01-10", "2027-01-11", "2027-01-12"].map(LocalDate.parse);
let roomId: string;
let emptyRoomId: string;
let foreignRoomId: string;

afterAll(() => prisma.$disconnect());
beforeEach(async () => {
  await resetDatabase(prisma);
  await createActor(prisma);
  roomId = (await createRoom(prisma)).id;
  emptyRoomId = (await createRoom(prisma)).id;
  await createBranch(prisma, { id: "other-branch", slug: "other-branch" });
  foreignRoomId = (await createRoom(prisma, { branchId: "other-branch" })).id;
  await prisma.physicalRoom.createMany({
    data: [
      {
        id: "unit-1",
        branchId: TEST_BRANCH_ID,
        roomTypeId: roomId,
        label: "101",
      },
      {
        id: "unit-2",
        branchId: TEST_BRANCH_ID,
        roomTypeId: roomId,
        label: "102",
      },
      {
        id: "unit-inactive",
        branchId: TEST_BRANCH_ID,
        roomTypeId: roomId,
        label: "103",
        active: false,
      },
    ],
  });
  await prisma.inventoryBlock.create({
    data: {
      id: "block-1",
      branchId: TEST_BRANCH_ID,
      physicalRoomId: "unit-2",
      startDate: new Date("2027-01-11T00:00:00.000Z"),
      endDate: new Date("2027-01-13T00:00:00.000Z"),
      reason: "MAINTENANCE",
      createdById: actor.id,
    },
  });
});

describe("PrismaInventoryReader", () => {
  it("keeps every requested listing and night including zero capacity rows", async () => {
    const consumption: ReservationConsumptionReader = {
      readSoldOnDates: async (): Promise<readonly SoldNightContribution[]> => [
        { roomTypeId: roomId, night: nights[1]!, sold: 1 },
      ],
      readFutureSold: async () => [],
      readAssignments: async () => [],
    };

    const result = await new PrismaInventoryReader(
      prisma,
      consumption,
    ).readNights({
      branchId: TEST_BRANCH_ID,
      roomTypeIds: [emptyRoomId, roomId, roomId],
      nights: [nights[2]!, nights[0]!, nights[1]!, nights[1]!],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected the inventory read to succeed.");
    expect(result.value).toHaveLength(6);
    const actual = result.value.map((row) => ({
      roomTypeId: row.roomTypeId,
      night: row.night.value,
      capacity: row.capacity,
      blocked: row.blocked,
      sold: row.sold,
    }));
    const expected = [
      {
        roomTypeId: roomId,
        night: "2027-01-10",
        capacity: 2,
        blocked: 0,
        sold: 0,
      },
      {
        roomTypeId: roomId,
        night: "2027-01-11",
        capacity: 1,
        blocked: 1,
        sold: 1,
      },
      {
        roomTypeId: roomId,
        night: "2027-01-12",
        capacity: 1,
        blocked: 1,
        sold: 0,
      },
      {
        roomTypeId: emptyRoomId,
        night: "2027-01-10",
        capacity: 0,
        blocked: 0,
        sold: 0,
      },
      {
        roomTypeId: emptyRoomId,
        night: "2027-01-11",
        capacity: 0,
        blocked: 0,
        sold: 0,
      },
      {
        roomTypeId: emptyRoomId,
        night: "2027-01-12",
        capacity: 0,
        blocked: 0,
        sold: 0,
      },
    ].sort(
      (left, right) =>
        left.roomTypeId.localeCompare(right.roomTypeId) ||
        left.night.localeCompare(right.night),
    );
    expect(actual).toEqual(expected);
  });

  it("returns hidden NOT_FOUND for a listing outside the supplied branch", async () => {
    const result = await new PrismaInventoryReader(
      prisma,
      new EmptyReservationConsumptionReader(),
    ).readNights({
      branchId: TEST_BRANCH_ID,
      roomTypeIds: [roomId, foreignRoomId],
      nights,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("fails closed when consumption returns a duplicate row", async () => {
    const consumption: ReservationConsumptionReader = {
      readSoldOnDates: async () => [
        { roomTypeId: roomId, night: nights[0]!, sold: 1 },
        { roomTypeId: roomId, night: nights[0]!, sold: 1 },
      ],
      readFutureSold: async () => [],
      readAssignments: async () => [],
    };

    await expect(
      new PrismaInventoryReader(prisma, consumption).readNights({
        branchId: TEST_BRANCH_ID,
        roomTypeIds: [roomId],
        nights,
      }),
    ).rejects.toThrow("Reservation consumption returned a duplicate row.");
  });

  it.each([
    "unrequested listing",
    "unrequested night",
    "zero sold",
    "unsafe sold",
  ] as const)("fails closed for an %s contribution", async (kind) => {
    const contribution: SoldNightContribution =
      kind === "unrequested listing"
        ? { roomTypeId: foreignRoomId, night: nights[0]!, sold: 1 }
        : kind === "unrequested night"
          ? {
              roomTypeId: roomId,
              night: LocalDate.parse("2027-02-01"),
              sold: 1,
            }
          : {
              roomTypeId: roomId,
              night: nights[0]!,
              sold: kind === "zero sold" ? 0 : Number.MAX_SAFE_INTEGER + 1,
            };
    const consumption: ReservationConsumptionReader = {
      readSoldOnDates: async () => [contribution],
      readFutureSold: async () => [],
      readAssignments: async () => [],
    };

    await expect(
      new PrismaInventoryReader(prisma, consumption).readNights({
        branchId: TEST_BRANCH_ID,
        roomTypeIds: [roomId],
        nights,
      }),
    ).rejects.toThrow("Reservation consumption returned an invalid row.");
  });

  it("uses an explicitly empty consumption adapter until M8", async () => {
    const empty = new EmptyReservationConsumptionReader();

    await expect(
      empty.readSoldOnDates({
        branchId: TEST_BRANCH_ID,
        roomTypeIds: [roomId],
        nights,
      }),
    ).resolves.toEqual([]);
    await expect(
      empty.readFutureSold({
        branchId: TEST_BRANCH_ID,
        roomTypeId: roomId,
        from: nights[0]!,
      }),
    ).resolves.toEqual([]);
    await expect(
      empty.readAssignments({
        branchId: TEST_BRANCH_ID,
        physicalRoomId: "unit-1",
        window: { kind: "FROM", from: nights[0]! },
      }),
    ).resolves.toEqual([]);
  });
});
