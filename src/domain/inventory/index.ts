export {
  AvailabilityCalculator,
  type AvailabilityResult,
  type NightAvailability,
  type NightInventory,
} from "./availability-calculator";
export {
  checkInventoryReduction,
  type CapacityReductionChange,
  type InventoryBlockRange,
  type InventoryReductionInput,
  type InventoryReductionResult,
  type ReductionConflict,
} from "./inventory-reduction";
export {
  PHYSICAL_ROOM_LABEL_MAX,
  PHYSICAL_ROOM_NOTES_MAX,
  parsePhysicalRoomInput,
  parsePhysicalRoomPatch,
  type PhysicalRoomInput,
  type PhysicalRoomPatch,
} from "./physical-room";
