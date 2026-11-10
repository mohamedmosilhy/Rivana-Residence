import type { AuditLog } from "@/application/audit";
import {
  ManagePhysicalRooms,
  type PhysicalRoomContext,
  type ReservationConsumptionReader,
} from "@/application/inventory";
import { PrismaAuditLog } from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { EmptyReservationConsumptionReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/empty-reservation-consumption-reader";
import { PrismaInventoryLock } from "@/infrastructure/db/prisma/repositories/reservations/inventory/inventory-lock";
import { PrismaInventoryReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/inventory-reader";
import { PrismaPhysicalRoomRepository } from "@/infrastructure/db/prisma/repositories/reservations/inventory/physical-room-repository";
import { PrismaRoomTypeCatalog } from "@/infrastructure/db/prisma/repositories/reservations/room-type-catalog";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import type { PrismaClient } from "@/generated/prisma/client";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";

import { deferred } from "./concurrency";

type Options = Readonly<{
  consumption?: ReservationConsumptionReader;
  /** Wraps the transaction-bound audit adapter (e.g. to inject a failure). */
  audit?: (inner: AuditLog) => AuditLog;
  clock?: () => Date;
  /** Receives the PostgreSQL backend pid once the transaction has started. */
  onBackend?: (pid: number) => void;
}>;

/** The production wiring of M6-T5 on an arbitrary client, with test hooks. */
export function physicalRoomUseCase(
  client: PrismaClient,
  options: Options = {},
) {
  let current:
    | Parameters<
        ConstructorParameters<
          typeof PrismaReservationUnitOfWork<PhysicalRoomContext>
        >[1]
      >[0]
    | null = null;
  const inner = new PrismaReservationUnitOfWork<PhysicalRoomContext>(
    client,
    (transaction) => {
      current = transaction;
      const consumption =
        options.consumption ?? new EmptyReservationConsumptionReader();
      const audit = new PrismaAuditLog(transaction);
      return {
        inventoryLock: new PrismaInventoryLock(transaction),
        inventoryReader: new PrismaInventoryReader(transaction, consumption),
        consumption,
        physicalRooms: new PrismaPhysicalRoomRepository(transaction),
        audit: options.audit ? options.audit(audit) : audit,
      };
    },
  );
  const unitOfWork = options.onBackend
    ? {
        run: <T>(
          operation: Parameters<typeof inner.run<T>>[0],
        ): ReturnType<typeof inner.run<T>> =>
          inner.run(async (context) => {
            const [backend] = await current!.$queryRaw<
              Readonly<{ pid: number }>[]
            >`SELECT pg_backend_pid()::int AS pid`;
            options.onBackend!(backend!.pid);
            return operation(context);
          }),
      }
    : inner;
  return new ManagePhysicalRooms({
    unitOfWork,
    rooms: new PrismaPhysicalRoomRepository(client),
    catalog: new PrismaRoomTypeCatalog(client),
    clock: { now: options.clock ?? (() => new Date()) },
    ids: new Cuid2IdGenerator(),
  });
}

export function backendPid() {
  const pid = deferred<number>();
  return { pid, onBackend: (value: number) => pid.resolve(value) };
}
