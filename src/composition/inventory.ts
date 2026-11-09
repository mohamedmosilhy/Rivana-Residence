import "server-only";

import {
  ManagePhysicalRooms,
  type PhysicalRoomContext,
} from "@/application/inventory";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaAuditLog } from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { EmptyReservationConsumptionReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/empty-reservation-consumption-reader";
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
