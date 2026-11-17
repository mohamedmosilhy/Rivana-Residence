import type { AuditLog } from "@/application/audit";
import type { GuestRepository } from "@/application/guests";
import type {
  InventoryLock,
  InventoryReader,
  ReservationConsumptionReader,
} from "@/application/inventory";
import type { ReservationRepository } from "./ports";

/** Ports bound to the same transaction by composition. Later workflows extend this set. */
export type ReservationStorageContext = Readonly<{
  reservations: ReservationRepository;
  guests: GuestRepository;
  consumption: ReservationConsumptionReader;
  inventoryLock: InventoryLock;
  inventoryReader: InventoryReader;
  audit: AuditLog;
}>;
