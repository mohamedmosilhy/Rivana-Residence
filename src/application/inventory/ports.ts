import type { Result } from "@/application/shared/result";
import type { LocalDate } from "@/domain/shared/local-date";
import type { StayRange } from "@/domain/shared/stay-range";

export type SoldNightContribution = Readonly<{
  roomTypeId: string;
  night: LocalDate;
  sold: number;
}>;

export type AssignmentWindow =
  | Readonly<{ kind: "INTERSECTING"; range: StayRange }>
  | Readonly<{ kind: "FROM"; from: LocalDate }>;

/**
 * Reservation owned inventory consumption. M6 supplies an empty adapter. M8
 * replaces it with transaction bound reads of consuming lines and assignments.
 */
export interface ReservationConsumptionReader {
  readSoldOnDates(input: {
    branchId: string;
    roomTypeIds: readonly string[];
    nights: readonly LocalDate[];
  }): Promise<readonly SoldNightContribution[]>;
  readFutureSold(input: {
    branchId: string;
    roomTypeId: string;
    from: LocalDate;
  }): Promise<readonly SoldNightContribution[]>;
  readAssignments(input: {
    branchId: string;
    physicalRoomId: string;
    window: AssignmentWindow;
  }): Promise<readonly StayRange[]>;
}

export type InventoryNightRecord = Readonly<{
  roomTypeId: string;
  night: LocalDate;
  capacity: number;
  blocked: number;
  sold: number;
}>;

export interface InventoryReader {
  /** Returns the complete requested listing and night product. */
  readNights(input: {
    branchId: string;
    roomTypeIds: readonly string[];
    nights: readonly LocalDate[];
  }): Promise<Result<readonly InventoryNightRecord[]>>;
}

export interface InventoryLock {
  /** Locks the complete branch owned set once, in ascending room type id order. */
  lockRoomTypes(
    branchId: string,
    roomTypeIds: readonly string[],
  ): Promise<Result<void>>;
}
