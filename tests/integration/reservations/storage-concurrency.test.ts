import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createRoom,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import {
  insertStorage,
  reservationData,
  roomData,
} from "../support/reservation-storage";
import { testDatabaseUrl } from "../support/test-database";
import { waitForDatabaseLock } from "./support/concurrency";

const observer = createTestClient();
beforeEach(() => resetDatabase(observer));
afterAll(() => observer.$disconnect());

async function connections(
  run: (winner: Client, loser: Client, loserPid: number) => Promise<void>,
) {
  const winner = new Client({
    connectionString: testDatabaseUrl().url,
    options: "-c TimeZone=UTC",
  });
  const loser = new Client({
    connectionString: testDatabaseUrl().url,
    options: "-c TimeZone=UTC",
  });
  await Promise.all([winner.connect(), loser.connect()]);
  try {
    const pid = (
      await loser.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
    ).rows[0]!.pid;
    await run(winner, loser, pid);
  } finally {
    await Promise.all([winner.query("ROLLBACK"), loser.query("ROLLBACK")]);
    await Promise.all([winner.end(), loser.end()]);
  }
}

describe("M8 storage constraint races (not booking workflow proofs)", () => {
  it("serializes duplicate NULL-creator idempotency keys, 20 observed waits", async () => {
    await connections(async (winner, loser, pid) => {
      for (let iteration = 0; iteration < 20; iteration++) {
        await winner.query("BEGIN");
        await loser.query("BEGIN");
        await insertStorage(
          winner,
          "Reservation",
          reservationData({ idempotencyKeyHash: `key-${iteration}` }),
        );
        const competing = insertStorage(
          loser,
          "Reservation",
          reservationData({ idempotencyKeyHash: `key-${iteration}` }),
        ).then(
          () => ({ code: "unexpected-success" }),
          (error: unknown) => error,
        );
        await waitForDatabaseLock(observer, pid);
        await winner.query("COMMIT");
        expect(await competing).toMatchObject({
          code: "23505",
          constraint: "Reservation_idempotency_key",
        });
        await loser.query("ROLLBACK");
        expect(
          await observer.reservation.count({
            where: { idempotencyKeyHash: `key-${iteration}` },
          }),
        ).toBe(1);
      }
    });
    expect(await observer.reservation.count()).toBe(20);
  });
  it("serializes overlapping physical assignments, 20 observed waits", async () => {
    const room = await createRoom(observer);
    await observer.physicalRoom.create({
      data: {
        id: "unit",
        roomTypeId: room.id,
        branchId: TEST_BRANCH_ID,
        label: "101",
      },
    });
    await connections(async (winner, loser, pid) => {
      const parent = reservationData();
      await insertStorage(winner, "Reservation", parent);
      for (let iteration = 0; iteration < 20; iteration++) {
        await winner.query("BEGIN");
        await loser.query("BEGIN");
        await insertStorage(
          winner,
          "ReservationRoom",
          roomData(parent.id, room.id, { physicalRoomId: "unit" }),
        );
        const competing = insertStorage(
          loser,
          "ReservationRoom",
          roomData(parent.id, room.id, { physicalRoomId: "unit" }),
        ).then(
          () => ({ code: "unexpected-success" }),
          (error: unknown) => error,
        );
        await waitForDatabaseLock(observer, pid);
        await winner.query("COMMIT");
        expect(await competing).toMatchObject({
          code: "23P01",
          constraint: "ReservationRoom_no_double_assignment",
        });
        await loser.query("ROLLBACK");
        expect(await observer.reservationRoom.count()).toBe(1);
        await observer.reservationRoom.deleteMany();
      }
    });
  });
});
