// Public surface of the inventory application module (dependency rule D-8).
export {
  InventoryGuard,
  validateInventoryReduction,
  type InventoryGuardContext,
  type InventoryGuardOperation,
} from "./inventory-guard";
export type {
  AssignmentWindow,
  AvailabilityBranch,
  AvailabilityCatalog,
  CatalogRoomType,
  InventoryLock,
  InventoryNightRecord,
  InventoryReader,
  LastSyncCheckpointReader,
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
export { ManageBlocks, type BlockContext } from "./manage-blocks";
export type {
  BlockChange,
  BlockCreate,
  BlockRecord,
  BlockRepository,
} from "./ports";
export {
  GetAvailabilityGrid,
  type AvailabilityGrid,
  type AvailabilityGridNight,
  type AvailabilityGridRoomType,
} from "./get-availability-grid";
export {
  SearchAvailability,
  type ListingSearchResult,
  type SearchAvailabilityResult,
  type SearchRefusal,
} from "./search-availability";
