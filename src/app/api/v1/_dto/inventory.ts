import type { PhysicalRoomRecord } from "@/application/inventory";
import type { PhysicalRoomDto } from "@/contracts/api/v1/inventory";

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
