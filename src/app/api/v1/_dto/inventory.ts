import type {
  AvailabilityGrid,
  BlockRecord,
  PhysicalRoomRecord,
} from "@/application/inventory";
import type {
  AvailabilityGridDto,
  BlockDto,
  PhysicalRoomDto,
} from "@/contracts/api/v1/inventory";

// Application record → HTTP DTO for physical units (M6-T5).
export function physicalRoom(record: PhysicalRoomRecord): PhysicalRoomDto {
  return {
    id: record.id,
    branchId: record.branchId,
    roomTypeId: record.roomTypeId,
    label: record.label,
    active: record.active,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

// Application record → HTTP DTO for blocks (M6-T6). The listing id stays
// internal.
export function block(record: BlockRecord): BlockDto {
  return {
    id: record.id,
    branchId: record.branchId,
    physicalRoomId: record.physicalRoomId,
    startDate: record.range.checkIn.value,
    endDate: record.range.checkOut.value,
    reason: record.reason,
    note: record.note,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

// Application grid → HTTP DTO (M6-T8, API-S20).
export function availabilityGrid(grid: AvailabilityGrid): AvailabilityGridDto {
  return {
    roomTypes: grid.roomTypes.map((roomType) => ({
      id: roomType.id,
      name: roomType.name,
      nights: roomType.nights.map((night) => ({
        night: night.night.value,
        capacity: night.capacity,
        sold: night.sold,
        free: night.free,
        blocked: night.blocked,
      })),
    })),
    lastSyncCheckpoint: grid.lastSyncCheckpoint?.toISOString() ?? null,
  };
}
