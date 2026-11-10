import { authorizeBranch } from "@/application/auth/authorize-branch";
import type { StaffPrincipal } from "@/application/auth/ports";
import {
  failure,
  invalid,
  success,
  type Result,
} from "@/application/shared/result";
import { parseStaffReadWindow } from "@/domain/inventory";
import type { LocalDate } from "@/domain/shared/local-date";

import { readListingNights } from "./read-listing-nights";
import type {
  AvailabilityCatalog,
  InventoryReader,
  LastSyncCheckpointReader,
} from "./ports";

export type AvailabilityGridNight = Readonly<{
  night: LocalDate;
  capacity: number;
  sold: number;
  free: number;
  blocked: number;
}>;

export type AvailabilityGridRoomType = Readonly<{
  id: string;
  name: string;
  nights: readonly AvailabilityGridNight[];
}>;

export type AvailabilityGrid = Readonly<{
  roomTypes: readonly AvailabilityGridRoomType[];
  lastSyncCheckpoint: Date | null;
}>;

const BRANCH_NOT_FOUND = "This branch was not found.";

/**
 * API-S20: staff inventory grid. A read: no lock, no write, no cache. Every
 * listing of the branch appears, whatever its publication status, with every
 * requested night (zero counts when it has no active unit).
 */
export class GetAvailabilityGrid {
  constructor(
    private readonly deps: Readonly<{
      catalog: AvailabilityCatalog;
      reader: InventoryReader;
      checkpoints: LastSyncCheckpointReader;
    }>,
  ) {}

  async execute(
    staff: StaffPrincipal | null,
    branchId: string,
    query: unknown,
  ): Promise<Result<AvailabilityGrid>> {
    const access = authorizeBranch(staff, "inventory:read", branchId);
    if (!access.ok) return access;
    const window = parseStaffReadWindow(query);
    if (!window.ok) {
      return invalid("Choose a valid date window.", window.issues);
    }
    if (!(await this.deps.catalog.findBranch(branchId))) {
      return failure("NOT_FOUND", BRANCH_NOT_FOUND);
    }

    const nights = [...window.value.nights()];
    const read = await readListingNights(this.deps, {
      branchId,
      scope: "ALL",
      nights,
    });
    if (!read.ok) return read;
    const { roomTypes, records } = read.value;

    const byRoomType = new Map<string, Map<string, AvailabilityGridNight>>();
    for (const record of records) {
      const free = record.capacity - record.sold;
      // Sold above capacity is an integrity failure, never a displayable
      // number: surface it as a redacted server error instead of clamping.
      if (free < 0) {
        throw new Error("Inventory is oversold for a listing night.");
      }
      const rows = byRoomType.get(record.roomTypeId) ?? new Map();
      rows.set(record.night.value, {
        night: record.night,
        capacity: record.capacity,
        sold: record.sold,
        free,
        blocked: record.blocked,
      });
      byRoomType.set(record.roomTypeId, rows);
    }

    return success({
      roomTypes: roomTypes.map((roomType) => ({
        id: roomType.id,
        name: roomType.name,
        nights: nights.map((night) => {
          const row = byRoomType.get(roomType.id)?.get(night.value);
          if (!row) throw new Error("Inventory grid is missing a night.");
          return row;
        }),
      })),
      lastSyncCheckpoint: await this.deps.checkpoints.read(branchId),
    });
  }
}
