import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { StaffPrincipal } from "@/application/auth/ports";
import { success } from "@/application/shared/result";
import { LocalDate } from "@/domain/shared/local-date";
import { PrismaInventoryReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/inventory-reader";
import { EmptyReservationConsumptionReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/empty-reservation-consumption-reader";
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
import { backendPid, physicalRoomUseCase } from "./support/physical-rooms";
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

const admin: StaffPrincipal = {
  id: "actor-admin",
  name: "Admin",
  email: "a@example.test",
  role: "ADMIN",
  sessionId: "s",
  branchIds: [],
};
const NIGHT = LocalDate.parse("2031-07-04");

function unit(id: string, branchId: string, roomTypeId: string, label: string) {
  return prisma.physicalRoom.create({
    data: { id, branchId, roomTypeId, label, active: true },
  });
}

async function capacity(branchId: string, roomTypeId: string) {
  const result = await new PrismaInventoryReader(
    prisma,
    new EmptyReservationConsumptionReader(),
  ).readNights({ branchId, roomTypeIds: [roomTypeId], nights: [NIGHT] });
  if (!result.ok) throw new Error("capacity read failed");
  return result.value[0]!;
}

describe("M6-T5 physical unit concurrency", () => {
  it("keeps capacity nonnegative when units are deactivated together, 20 iterations", async () => {
    await prisma.user.create({
      data: {
        id: "actor-admin",
        name: "A",
        email: "a@example.test",
        role: "ADMIN",
      },
    });
    await unit("u1", TEST_BRANCH_ID, firstRoomId, "1");
    await unit("u2", TEST_BRANCH_ID, firstRoomId, "2");
    await withIndependentClients(2, async ([left, right]) => {
      if (!left || !right) throw new Error("Expected two clients.");
      for (let iteration = 0; iteration < 20; iteration += 1) {
        await prisma.auditEvent.deleteMany();
        await prisma.physicalRoom.updateMany({ data: { active: true } });
        const start = barrier(2);
        const run = async (client: PrismaClient, id: string) => {
          const useCase = physicalRoomUseCase(client);
          await start();
          return useCase.update(admin, id, { active: false });
        };
        const results = await Promise.all([run(left, "u1"), run(right, "u2")]);
        // Zero sold in M6, so both reductions are valid.
        expect(results.every((result) => result.ok)).toBe(true);
        const state = await capacity(TEST_BRANCH_ID, firstRoomId);
        expect(state).toMatchObject({ capacity: 0, sold: 0 });
        expect(state.capacity - state.sold).toBeGreaterThanOrEqual(0);
        expect(await prisma.auditEvent.count()).toBe(2);
      }
    });
  });

  it("makes deactivation wait on the listing lock and reload fresh state, 20 iterations", async () => {
    await prisma.user.create({
      data: {
        id: "actor-admin",
        name: "A",
        email: "a@example.test",
        role: "ADMIN",
      },
    });
    await unit("u1", TEST_BRANCH_ID, firstRoomId, "1");
    await withIndependentClients(3, async ([holder, waiter, observer]) => {
      if (!holder || !waiter || !observer)
        throw new Error("Expected three clients.");
      for (let iteration = 0; iteration < 20; iteration += 1) {
        await prisma.physicalRoom.update({
          where: { id: "u1" },
          data: { active: true, label: "1" },
        });
        const held = deferred();
        const release = deferred();
        const fresh = `fresh-${iteration}`;
        const holding = unitOfWork(holder).run(async (context) => {
          const locked = await context.inventoryLock.lockRoomTypes(
            TEST_BRANCH_ID,
            [firstRoomId],
          );
          if (!locked.ok) return locked;
          await context.transaction.physicalRoom.update({
            where: { id: "u1" },
            data: { label: fresh },
          });
          held.resolve();
          await release.promise;
          return success(undefined);
        });
        await held.promise;

        const probe = backendPid();
        const waiting = physicalRoomUseCase(waiter, {
          onBackend: probe.onBackend,
        }).update(admin, "u1", { active: false });
        await waitForDatabaseLock(observer, await probe.pid.promise);

        release.resolve();
        await holding;
        const result = await waiting;
        expect(result).toMatchObject({
          ok: true,
          value: { active: false, label: fresh },
        });
        expect(
          await prisma.physicalRoom.findUniqueOrThrow({ where: { id: "u1" } }),
        ).toMatchObject({ active: false, label: fresh });
      }
    });
  });

  it("isolates a branch with matching names and labels, 20 iterations", async () => {
    await prisma.user.create({
      data: {
        id: "actor-admin",
        name: "A",
        email: "a@example.test",
        role: "ADMIN",
      },
    });
    await unit("a1", TEST_BRANCH_ID, firstRoomId, "1");
    await unit("b1", "other-branch", foreignRoomId, "1");
    await prisma.room.updateMany({ data: { name: "Same name" } });
    const snapshotA = async () => ({
      rows: await prisma.physicalRoom.findMany({
        where: { branchId: TEST_BRANCH_ID },
      }),
      night: await capacity(TEST_BRANCH_ID, firstRoomId),
    });
    const before = await snapshotA();
    await withIndependentClients(1, async ([client]) => {
      for (let iteration = 0; iteration < 20; iteration += 1) {
        const useCase = physicalRoomUseCase(client!);
        expect((await useCase.update(admin, "b1", { active: false })).ok).toBe(
          true,
        );
        expect((await useCase.update(admin, "b1", { active: true })).ok).toBe(
          true,
        );
        // The wrong branch's id is hidden from a branch A manager.
        const manager = {
          ...admin,
          role: "MANAGER" as const,
          branchIds: [TEST_BRANCH_ID],
        };
        expect(
          await useCase.update(manager, "b1", { active: false }),
        ).toMatchObject({
          ok: false,
          error: { code: "NOT_FOUND" },
        });
        expect(await snapshotA()).toEqual(before);
      }
    });
    expect(
      (await prisma.physicalRoom.findUniqueOrThrow({ where: { id: "b1" } }))
        .active,
    ).toBe(true);
  });
});
