import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { failure, success } from "@/application/shared/result";
import { InventoryGuard } from "@/application/inventory";
import { auditEvent } from "@/domain/audit";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { PrismaInventoryLock } from "@/infrastructure/db/prisma/repositories/reservations/inventory/inventory-lock";
import { PrismaAuditLog } from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";

import {
  createBranch,
  createRoom,
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import { deferred, withIndependentClients } from "./support/concurrency";

const prisma = createTestClient();
let roomId: string;
let sequence = 0;

type Context = Readonly<{
  transaction: Prisma.TransactionClient;
  inventoryLock: PrismaInventoryLock;
  auditLog: PrismaAuditLog;
}>;

function unitOfWork(client: PrismaClient) {
  return new PrismaReservationUnitOfWork<Context>(client, (transaction) => ({
    transaction,
    inventoryLock: new PrismaInventoryLock(transaction),
    auditLog: new PrismaAuditLog(transaction),
  }));
}

function unitId() {
  sequence += 1;
  return `uow-unit-${sequence}`;
}

async function insertUnit(transaction: Prisma.TransactionClient, id: string) {
  await transaction.physicalRoom.create({
    data: {
      id,
      branchId: TEST_BRANCH_ID,
      roomTypeId: roomId,
      label: id,
    },
  });
}

function audit() {
  return auditEvent({
    occurredAt: new Date("2026-11-09T12:00:00.000Z"),
    actorType: "SYSTEM",
    actorId: null,
    action: "branch.created",
    entityType: "Branch",
    entityId: TEST_BRANCH_ID,
    branchId: TEST_BRANCH_ID,
    reason: null,
    changes: { slug: "new-cairo", name: "Rivana Residence", status: "ACTIVE" },
  });
}

afterAll(() => prisma.$disconnect());
beforeEach(async () => {
  await resetDatabase(prisma);
  roomId = (await createRoom(prisma)).id;
});

describe("PrismaReservationUnitOfWork", () => {
  it("commits a successful result at READ COMMITTED on one connection", async () => {
    const id = unitId();

    const result = await unitOfWork(prisma).run(async (context) => {
      const [before] = await context.transaction.$queryRaw<
        Readonly<{ pid: number; isolation: string }>[]
      >`SELECT pg_backend_pid()::int AS pid, current_setting('transaction_isolation') AS isolation`;
      const locked = await context.inventoryLock.lockRoomTypes(TEST_BRANCH_ID, [
        roomId,
      ]);
      const [after] = await context.transaction.$queryRaw<
        Readonly<{ pid: number }>[]
      >`SELECT pg_backend_pid()::int AS pid`;
      if (!locked.ok) return locked;
      await insertUnit(context.transaction, id);
      return success({ before, after });
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        before: { isolation: "read committed" },
      },
    });
    if (!result.ok) throw new Error("Expected the transaction to succeed.");
    expect(result.value.before?.pid).toBe(result.value.after?.pid);
    expect(await prisma.physicalRoom.count({ where: { id } })).toBe(1);
  });

  it("rolls back a write when the callback returns a failed result", async () => {
    const id = unitId();

    const result = await unitOfWork(prisma).run(async ({ transaction }) => {
      await insertUnit(transaction, id);
      await new PrismaAuditLog(transaction).append(audit());
      return failure("CONFLICT", "Refuse the operation.");
    });

    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await prisma.physicalRoom.count({ where: { id } })).toBe(0);
    expect(
      await prisma.auditEvent.count({ where: { entityId: TEST_BRANCH_ID } }),
    ).toBe(0);
  });

  it("rolls back and preserves an unexpected exception", async () => {
    const id = unitId();
    const unexpected = new Error("unexpected");

    await expect(
      unitOfWork(prisma).run(async ({ transaction }) => {
        await insertUnit(transaction, id);
        throw unexpected;
      }),
    ).rejects.toBe(unexpected);
    expect(await prisma.physicalRoom.count({ where: { id } })).toBe(0);
  });

  it("commits a guarded mutation and its audit on the same transaction", async () => {
    const id = unitId();

    const result = await new InventoryGuard(unitOfWork(prisma)).execute({
      branchId: TEST_BRANCH_ID,
      roomTypeIds: [roomId],
      load: async () => success("fresh state"),
      validate: () => success("checked"),
      mutate: async ({ transaction }) => {
        await insertUnit(transaction, id);
        return success(id);
      },
      audit: async ({ auditLog }) => auditLog.append(audit()),
    });

    expect(result).toEqual(success(id));
    expect(await prisma.physicalRoom.count({ where: { id } })).toBe(1);
    expect(
      await prisma.auditEvent.count({ where: { entityId: TEST_BRANCH_ID } }),
    ).toBe(1);
  });

  it("rolls back a guarded mutation and attempted audit when audit fails", async () => {
    const id = unitId();
    const auditFailure = new Error("audit append failed");

    await expect(
      new InventoryGuard(unitOfWork(prisma)).execute({
        branchId: TEST_BRANCH_ID,
        roomTypeIds: [roomId],
        load: async () => success("fresh state"),
        validate: () => success("checked"),
        mutate: async ({ transaction }) => {
          await insertUnit(transaction, id);
          return success(id);
        },
        audit: async ({ auditLog }) => {
          await auditLog.append(audit());
          throw auditFailure;
        },
      }),
    ).rejects.toBe(auditFailure);
    expect(await prisma.physicalRoom.count({ where: { id } })).toBe(0);
    expect(
      await prisma.auditEvent.count({ where: { entityId: TEST_BRANCH_ID } }),
    ).toBe(0);
  });

  it("rolls back when any requested listing is outside the branch", async () => {
    const id = unitId();

    await createBranch(prisma, { id: "other-branch", slug: "other-branch" });
    const foreignRoom = await createRoom(prisma, {
      branchId: "other-branch",
    });
    const result = await unitOfWork(prisma).run(async (context) => {
      await insertUnit(context.transaction, id);
      return context.inventoryLock.lockRoomTypes(TEST_BRANCH_ID, [
        roomId,
        foreignRoom.id,
      ]);
    });

    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await prisma.physicalRoom.count({ where: { id } })).toBe(0);
  });

  it("maps a real five second PostgreSQL lock timeout to TRY_AGAIN", async () => {
    await withIndependentClients(2, async ([holder, waiter]) => {
      if (!holder || !waiter) throw new Error("Expected two clients.");
      const held = deferred();
      const release = deferred();
      const holding = holder.$transaction(
        async (transaction) => {
          await transaction.$queryRaw`
            SELECT id FROM "Room" WHERE id = ${roomId} FOR NO KEY UPDATE
          `;
          held.resolve();
          await release.promise;
        },
        { timeout: 15_000 },
      );
      await held.promise;

      const startedAt = Date.now();
      try {
        const result = await unitOfWork(waiter).run((context) =>
          context.inventoryLock.lockRoomTypes(TEST_BRANCH_ID, [roomId]),
        );
        const elapsed = Date.now() - startedAt;

        expect(result).toMatchObject({
          ok: false,
          error: { code: "TRY_AGAIN" },
        });
        expect(elapsed).toBeGreaterThanOrEqual(4_500);
        expect(elapsed).toBeLessThan(9_500);
      } finally {
        release.resolve();
        await holding;
      }
    });
  });
});
