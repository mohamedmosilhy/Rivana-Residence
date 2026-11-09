// Public surface of the inventory application module (dependency rule D-8).
export {
  InventoryGuard,
  validateInventoryReduction,
  type InventoryGuardContext,
  type InventoryGuardOperation,
} from "./inventory-guard";
export type {
  AssignmentWindow,
  InventoryLock,
  InventoryNightRecord,
  InventoryReader,
  ReservationConsumptionReader,
  SoldNightContribution,
} from "./ports";
export {
  ManagePhysicalRooms,
  type PhysicalRoomContext,
} from "./manage-physical-rooms";
export type {
  ActiveBlockRange,
  BranchVisibility,
  PhysicalRoomChange,
  PhysicalRoomCreate,
  PhysicalRoomRecord,
  PhysicalRoomRepository,
  RoomTypeCatalog,
} from "./ports";
