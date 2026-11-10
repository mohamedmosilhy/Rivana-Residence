import "server-only";

import {
  GetAvailabilityGrid,
  ManageBlocks,
  ManagePhysicalRooms,
  type BlockContext,
  type PhysicalRoomContext,
} from "@/application/inventory";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaAuditLog } from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { EmptyReservationConsumptionReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/empty-reservation-consumption-reader";
import { PrismaAvailabilityCatalog } from "@/infrastructure/db/prisma/repositories/reservations/inventory/availability-catalog";
import { NullLastSyncCheckpointReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/null-sync-checkpoint-reader";
import { PrismaBlockRepository } from "@/infrastructure/db/prisma/repositories/reservations/inventory/block-repository";
import { PrismaInventoryLock } from "@/infrastructure/db/prisma/repositories/reservations/inventory/inventory-lock";
import { PrismaInventoryReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/inventory-reader";
import { PrismaPhysicalRoomRepository } from "@/infrastructure/db/prisma/repositories/reservations/inventory/physical-room-repository";
import { PrismaRoomTypeCatalog } from "@/infrastructure/db/prisma/repositories/reservations/room-type-catalog";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";

const clock = { now: () => new Date() };

/** M6 has no reservation persistence, so consumption stays the empty adapter. */
export function managePhysicalRooms() {
  const client = getPrisma();
  return new ManagePhysicalRooms({
    unitOfWork: new PrismaReservationUnitOfWork<PhysicalRoomContext>(
      client,
      (transaction) => {
        const consumption = new EmptyReservationConsumptionReader();
        return {
          inventoryLock: new PrismaInventoryLock(transaction),
          inventoryReader: new PrismaInventoryReader(transaction, consumption),
          consumption,
          physicalRooms: new PrismaPhysicalRoomRepository(transaction),
          audit: new PrismaAuditLog(transaction),
        };
      },
    ),
    rooms: new PrismaPhysicalRoomRepository(client),
    catalog: new PrismaRoomTypeCatalog(client),
    clock,
    ids: new Cuid2IdGenerator(),
  });
}

/** Block writes (M6-T6). Consumption stays the empty adapter until M8. */
export function manageBlocks() {
  const client = getPrisma();
  return new ManageBlocks({
    unitOfWork: new PrismaReservationUnitOfWork<BlockContext>(
      client,
      (transaction) => {
        const consumption = new EmptyReservationConsumptionReader();
        return {
          inventoryLock: new PrismaInventoryLock(transaction),
          inventoryReader: new PrismaInventoryReader(transaction, consumption),
          consumption,
          physicalRooms: new PrismaPhysicalRoomRepository(transaction),
          blocks: new PrismaBlockRepository(transaction),
          audit: new PrismaAuditLog(transaction),
        };
      },
    ),
    blocks: new PrismaBlockRepository(client),
    rooms: new PrismaPhysicalRoomRepository(client),
    catalog: new PrismaRoomTypeCatalog(client),
    clock,
    ids: new Cuid2IdGenerator(),
  });
}

/** Staff availability grid (M6-T8). Reads only: no lock and no cache. */
export function getAvailabilityGrid() {
  const client = getPrisma();
  return new GetAvailabilityGrid({
    catalog: new PrismaAvailabilityCatalog(client),
    reader: new PrismaInventoryReader(
      client,
      new EmptyReservationConsumptionReader(),
    ),
    checkpoints: new NullLastSyncCheckpointReader(),
  });
}
