import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { success } from "@/application/shared/result";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { PrismaInventoryLock } from "@/infrastructure/db/prisma/repositories/reservations/inventory/inventory-lock";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";

import {
  createBranch,
  createRoom,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import {
  barrier,
  deferred,
  waitForDatabaseLock,
  withIndependentClients,
} from "./support/concurrency";

const prisma = createTestClient();
let firstRoomId: string;
let secondRoomId: string;
let foreignRoomId: string;

type Context = Readonly<{
  transaction: Prisma.TransactionClient;
  inventoryLock: PrismaInventoryLock;
}>;

function unitOfWork(client: PrismaClient) {
  return new PrismaReservationUnitOfWork<Context>(client, (transaction) => ({
    transaction,
    inventoryLock: new PrismaInventoryLock(transaction),
  }));
}

afterAll(() => prisma.$disconnect());
beforeEach(async () => {
  await resetDatabase(prisma);
  firstRoomId = (await createRoom(prisma)).id;
  secondRoomId = (await createRoom(prisma)).id;
  await createBranch(prisma, { id: "other-branch", slug: "other-branch" });
  foreignRoomId = (await createRoom(prisma, { branchId: "other-branch" })).id;
});

describe("M6 inventory lock concurrency harness", () => {
  it("locks reversed multi-listing inputs without a deadlock for 20 iterations", async () => {
    await withIndependentClients(2, async ([left, right]) => {
      if (!left || !right) throw new Error("Expected two clients.");
      for (let iteration = 0; iteration < 20; iteration += 1) {
        const startTogether = barrier(2);
        const run = (client: PrismaClient, ids: readonly string[]) =>
          unitOfWork(client).run(async (context) => {
            await startTogether();
            const locked = await context.inventoryLock.lockRoomTypes(
              TEST_BRANCH_ID,
              ids,
            );
            if (!locked.ok) return locked;
            return success(iteration);
          });

        const results = await Promise.all([
          run(left, [secondRoomId, firstRoomId, secondRoomId]),
          run(right, [firstRoomId, secondRoomId]),
        ]);

        expect(results).toEqual([success(iteration), success(iteration)]);
      }
    });
  });

  it("waits on the same listing and reads the committed state for 20 iterations", async () => {
    await withIndependentClients(3, async ([holder, waiter, observer]) => {
      if (!holder || !waiter || !observer)
        throw new Error("Expected three clients.");
      for (let iteration = 0; iteration < 20; iteration += 1) {
        const held = deferred();
        const release = deferred();
        const waiterPid = deferred<number>();
        const committedName = `Committed while waiting ${iteration}`;

        const holding = unitOfWork(holder).run(async (context) => {
          const locked = await context.inventoryLock.lockRoomTypes(
            TEST_BRANCH_ID,
            [firstRoomId],
          );
          if (!locked.ok) return locked;
          await context.transaction.room.update({
            where: { id: firstRoomId },
            data: { name: committedName },
          });
          held.resolve();
          await release.promise;
          return success(undefined);
        });
        await held.promise;

        const waiting = unitOfWork(waiter).run(async (context) => {
          const [backend] = await context.transaction.$queryRaw<
            Readonly<{ pid: number }>[]
          >`SELECT pg_backend_pid()::int AS pid`;
          if (!backend) throw new Error("Expected a PostgreSQL backend id.");
          waiterPid.resolve(backend.pid);
          const locked = await context.inventoryLock.lockRoomTypes(
            TEST_BRANCH_ID,
            [firstRoomId],
          );
          if (!locked.ok) return locked;
          const room = await context.transaction.room.findUniqueOrThrow({
            where: { id: firstRoomId },
            select: { name: true },
          });
          return success(room.name);
        });

        await waitForDatabaseLock(observer, await waiterPid.promise);
        release.resolve();

        await expect(holding).resolves.toEqual(success(undefined));
        await expect(waiting).resolves.toEqual(success(committedName));
      }
    });
  });

  it("lets another branch lock and commit independently for 20 iterations", async () => {
    await withIndependentClients(2, async ([branchA, branchB]) => {
      if (!branchA || !branchB) throw new Error("Expected two clients.");
      for (let iteration = 0; iteration < 20; iteration += 1) {
        const held = deferred();
        const release = deferred();
        const holding = unitOfWork(branchA).run(async (context) => {
          const locked = await context.inventoryLock.lockRoomTypes(
            TEST_BRANCH_ID,
            [firstRoomId],
          );
          if (!locked.ok) return locked;
          held.resolve();
          await release.promise;
          return success(undefined);
        });
        await held.promise;

        try {
          const independent = await unitOfWork(branchB).run(async (context) => {
            const locked = await context.inventoryLock.lockRoomTypes(
              "other-branch",
              [foreignRoomId],
            );
            if (!locked.ok) return locked;
            await context.transaction.room.update({
              where: { id: foreignRoomId },
              data: { name: `Foreign ${iteration}` },
            });
            return success(iteration);
          });
          expect(independent).toEqual(success(iteration));
        } finally {
          release.resolve();
          await holding;
        }

        expect(
          await prisma.room.findUniqueOrThrow({
            where: { id: firstRoomId },
            select: { name: true },
          }),
        ).not.toEqual({ name: `Foreign ${iteration}` });
      }
    });
  });
});
