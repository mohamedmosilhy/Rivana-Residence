import "server-only";

import type {
  ReservationStorageContext,
  ReservationUnitOfWork,
} from "@/application/reservations";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { PrismaReservationRepository } from "@/infrastructure/db/prisma/repositories/reservations/reservation-repository";
import { PrismaGuestRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/guest-repository";
import { PrismaReservationConsumptionReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/reservation-consumption-reader";
import { PrismaInventoryLock } from "@/infrastructure/db/prisma/repositories/reservations/inventory/inventory-lock";
import { PrismaInventoryReader } from "@/infrastructure/db/prisma/repositories/reservations/inventory/inventory-reader";
import { PrismaAuditLog } from "@/infrastructure/db/prisma/repositories/audit/audit-log";

/** Storage foundation for later authorized reservation use cases. */
export function reservationUnitOfWork(): ReservationUnitOfWork<ReservationStorageContext> {
  return new PrismaReservationUnitOfWork(getPrisma(), (transaction) => {
    const consumption = new PrismaReservationConsumptionReader(transaction);
    return {
      reservations: new PrismaReservationRepository(transaction),
      guests: new PrismaGuestRepository(transaction),
      consumption,
      inventoryLock: new PrismaInventoryLock(transaction),
      inventoryReader: new PrismaInventoryReader(transaction, consumption),
      audit: new PrismaAuditLog(transaction),
    };
  });
}
