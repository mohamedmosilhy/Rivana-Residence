import type { Result } from "@/application/shared/result";
import type { BlockReason } from "@/domain/inventory";
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

/** A physical unit. Branch and listing ownership never change. */
export type PhysicalRoomRecord = Readonly<{
  id: string;
  branchId: string;
  roomTypeId: string;
  label: string;
  active: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type PhysicalRoomCreate = Readonly<{
  id: string;
  branchId: string;
  roomTypeId: string;
  label: string;
  notes: string | null;
  createdById: string;
  at: Date;
}>;

export type PhysicalRoomChange = Readonly<{
  label?: string;
  notes?: string | null;
  active?: boolean;
  updatedById: string;
  at: Date;
}>;

/** Branches a lookup may see: every branch, or an explicit allowed set. */
export type BranchVisibility = "ALL" | readonly string[];

export type ActiveBlockRange = Readonly<{ id: string; range: StayRange }>;

export interface PhysicalRoomRepository {
  /** Every unit of the branch, including inactive ones, in stable order. */
  listByBranch(branchId: string): Promise<readonly PhysicalRoomRecord[]>;
  /** Plain read constrained to visible branches; null when missing or hidden. */
  findVisible(
    id: string,
    visible: BranchVisibility,
  ): Promise<PhysicalRoomRecord | null>;
  /**
   * Locks the unit row (`FOR UPDATE`) and returns the committed state seen
   * after the lock. Only meaningful in a transaction. Null value when hidden; TRY_AGAIN when the
   * row stays locked past the 5 second lock timeout.
   */
  lockVisible(
    id: string,
    visible: BranchVisibility,
  ): Promise<Result<PhysicalRoomRecord | null>>;
  /** Uncancelled blocks of the unit. */
  listActiveBlocks(
    physicalRoomId: string,
  ): Promise<readonly ActiveBlockRange[]>;
  /** CONFLICT with a `label` field error for a duplicate label in the branch. */
  create(input: PhysicalRoomCreate): Promise<Result<PhysicalRoomRecord>>;
  update(
    id: string,
    change: PhysicalRoomChange,
  ): Promise<Result<PhysicalRoomRecord>>;
}

/**
 * Narrow bridge to the listing catalog: just what inventory writers need to
 * resolve a branch and a listing owned by it. Not the CMS repository.
 */
export interface RoomTypeCatalog {
  findBranch(
    branchId: string,
  ): Promise<Readonly<{ id: string; timeZone: string }> | null>;
  /** True only when the listing exists and belongs to the branch. */
  branchOwnsRoomType(branchId: string, roomTypeId: string): Promise<boolean>;
}

/** A unit block. Branch, unit, and start never change after creation. */
export type BlockRecord = Readonly<{
  id: string;
  branchId: string;
  physicalRoomId: string;
  /** The unit's listing; used for the lock, never exposed over HTTP. */
  roomTypeId: string;
  range: StayRange;
  reason: BlockReason;
  note: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
}>;

export type BlockCreate = Readonly<{
  id: string;
  branchId: string;
  physicalRoomId: string;
  range: StayRange;
  reason: BlockReason;
  note: string | null;
  createdById: string;
  at: Date;
}>;

export type BlockChange = Readonly<{
  endDate?: LocalDate;
  note?: string | null;
}>;

export interface BlockRepository {
  /** Uncancelled blocks of the branch overlapping the window, stable order. */
  listOverlapping(
    branchId: string,
    window: StayRange,
  ): Promise<readonly BlockRecord[]>;
  /** Plain read constrained to visible branches; null when missing or hidden. */
  findVisible(
    id: string,
    visible: BranchVisibility,
  ): Promise<BlockRecord | null>;
  /**
   * Locks the block row (`FOR UPDATE`) and returns the state committed after
   * the lock. Null when hidden; TRY_AGAIN past the 5 second lock timeout.
   */
  lockVisible(
    id: string,
    visible: BranchVisibility,
  ): Promise<Result<BlockRecord | null>>;
  /** CONFLICT with date field errors when the unit already has an overlapping block. */
  create(input: BlockCreate): Promise<Result<BlockRecord>>;
  /** Changes the end date or note; CONFLICT on overlap. */
  update(id: string, change: BlockChange): Promise<Result<BlockRecord>>;
  /** Soft cancellation of a locked, uncancelled block. */
  cancel(
    id: string,
    input: Readonly<{ cancelledById: string; at: Date }>,
  ): Promise<Result<BlockRecord>>;
}

export type CatalogRoomType = Readonly<{
  id: string;
  name: string;
  maxAdults: number;
  maxChildren: number;
}>;

export type AvailabilityBranch = Readonly<{
  id: string;
  timeZone: string;
  active: boolean;
}>;

/**
 * Uncached listing reads for availability. `ALL` returns every status (staff
 * grid); `PUBLISHED` is the public catalog. Both are ordered by `sortOrder`
 * then `id`.
 */
export interface AvailabilityCatalog {
  findBranch(branchId: string): Promise<AvailabilityBranch | null>;
  listRoomTypes(
    branchId: string,
    scope: "ALL" | "PUBLISHED",
  ): Promise<readonly CatalogRoomType[]>;
}

/** The last manual hotel system sync (UTC instant), null until M8 stores one. */
export interface LastSyncCheckpointReader {
  read(branchId: string): Promise<Date | null>;
}
