import { authorize } from "@/application/auth/authorize";
import {
  authorizeBranch,
  branchScope,
} from "@/application/auth/authorize-branch";
import type { StaffPrincipal } from "@/application/auth/ports";
import type { AuditLog } from "@/application/audit";
import type { Clock, IdGenerator } from "@/application/shared/providers";
import type { ReservationUnitOfWork } from "@/application/reservations";
import {
  failure,
  invalid,
  success,
  type Result,
} from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import {
  parseBlockInput,
  parseBlockPatch,
  parseStaffReadWindow,
  type BlockPatch,
} from "@/domain/inventory";
import type { LocalDate } from "@/domain/shared/local-date";
import { StayRange } from "@/domain/shared/stay-range";

import {
  InventoryGuard,
  validateInventoryReduction,
  type InventoryGuardContext,
} from "./inventory-guard";
import type {
  ActiveBlockRange,
  BlockRecord,
  BlockRepository,
  BranchVisibility,
  InventoryLock,
  InventoryNightRecord,
  InventoryReader,
  PhysicalRoomRecord,
  PhysicalRoomRepository,
  ReservationConsumptionReader,
  RoomTypeCatalog,
} from "./ports";

/** The ports bound to one transaction for block writes (M6-T6). */
export type BlockContext = InventoryGuardContext &
  Readonly<{
    inventoryLock: InventoryLock;
    inventoryReader: InventoryReader;
    consumption: ReservationConsumptionReader;
    physicalRooms: PhysicalRoomRepository;
    blocks: BlockRepository;
    audit: AuditLog;
  }>;

const BLOCK_NOT_FOUND = "This block was not found.";
const UNIT_NOT_FOUND = "This unit was not found in the branch.";
const BRANCH_NOT_FOUND = "This branch was not found.";
const CANCELLED = "This block was cancelled and can no longer change.";

type ReductionState = Readonly<{
  unit: PhysicalRoomRecord;
  blocks: readonly ActiveBlockRange[];
  nights: readonly InventoryNightRecord[];
  assignments: readonly StayRange[];
  /** Present for an extension: the locked current block. */
  current?: BlockRecord;
}>;

type UpdateOutcome = Readonly<{
  before: BlockRecord;
  after: BlockRecord;
  changed: boolean;
}>;

/**
 * Block administration (API-S24 to S27). Creating or changing the end date
 * goes through the `InventoryGuard`, so the listing lock is taken before any
 * unit, block, or sold read. A note only edit and a cancellation release or
 * annotate and take only the block row lock, never a listing lock.
 */
export class ManageBlocks {
  private readonly guard: InventoryGuard<BlockContext>;

  constructor(
    private readonly deps: Readonly<{
      unitOfWork: ReservationUnitOfWork<BlockContext>;
      blocks: BlockRepository;
      rooms: PhysicalRoomRepository;
      catalog: RoomTypeCatalog;
      clock: Clock;
      ids: IdGenerator;
    }>,
  ) {
    this.guard = new InventoryGuard(deps.unitOfWork);
  }

  /** S24: uncancelled blocks overlapping a window of at most 62 nights. */
  async list(
    staff: StaffPrincipal | null,
    branchId: string,
    query: unknown,
  ): Promise<Result<readonly BlockRecord[]>> {
    const access = authorizeBranch(staff, "inventory:read", branchId);
    if (!access.ok) return access;
    const window = parseStaffReadWindow(query);
    if (!window.ok) {
      return invalid("Choose a valid date window.", window.issues);
    }
    if (!(await this.deps.catalog.findBranch(branchId))) {
      return failure("NOT_FOUND", BRANCH_NOT_FOUND);
    }
    return success(
      await this.deps.blocks.listOverlapping(branchId, window.value),
    );
  }

  /** S25: a new block never oversells and never overlaps on its unit. */
  async create(
    staff: StaffPrincipal | null,
    branchId: string,
    input: unknown,
  ): Promise<Result<BlockRecord>> {
    const access = authorizeBranch(staff, "inventory:block", branchId);
    if (!access.ok) return access;
    const parsed = parseBlockInput(input);
    if (!parsed.ok) {
      return invalid("Some block details need attention.", parsed.issues);
    }
    if (!(await this.deps.catalog.findBranch(branchId))) {
      return failure("NOT_FOUND", BRANCH_NOT_FOUND);
    }
    const actor = access.value;
    const { physicalRoomId, range, reason, note } = parsed.value;
    // The path branch decides visibility; a body never overrides ownership.
    const inBranch: BranchVisibility = [branchId];
    const preliminary = await this.deps.rooms.findVisible(
      physicalRoomId,
      inBranch,
    );
    if (!preliminary) return failure("NOT_FOUND", UNIT_NOT_FOUND);
    const roomTypeId = preliminary.roomTypeId;

    return this.guard.execute<ReductionState, unknown, BlockRecord>({
      branchId,
      roomTypeIds: [roomTypeId],
      load: async (context) => {
        // The listing lock is held, so a unit deactivation cannot interleave.
        const unit = await context.physicalRooms.findVisible(
          physicalRoomId,
          inBranch,
        );
        if (!unit) return failure("NOT_FOUND", UNIT_NOT_FOUND);
        if (!unit.active) {
          return failure("CONFLICT", "This unit is inactive.", {
            physicalRoomId: ["Choose an active unit."],
          });
        }
        return this.reductionState(context, branchId, unit, range);
      },
      validate: (state) =>
        validateInventoryReduction(roomTypeId, {
          unit: { active: state.unit.active, blocks: state.blocks },
          change: { kind: "BLOCK", range },
          nights: state.nights,
          assignments: state.assignments,
        }),
      mutate: (context) =>
        context.blocks.create({
          id: this.deps.ids.next(),
          branchId,
          physicalRoomId,
          range,
          reason,
          note,
          createdById: actor.id,
          at: this.deps.clock.now(),
        }),
      audit: async (context, state, block) => {
        await context.audit.append(
          auditEvent({
            occurredAt: block.createdAt,
            actorType: "STAFF",
            actorId: actor.id,
            action: "inventory-block.created",
            entityType: "InventoryBlock",
            entityId: block.id,
            branchId,
            reason: null,
            changes: {
              physicalRoomId,
              roomTypeId: state.unit.roomTypeId,
              startDate: block.range.checkIn.value,
              endDate: block.range.checkOut.value,
              reason: block.reason,
              noteChanged: block.note !== null,
            },
          }),
        );
      },
    });
  }

  /** S26: an end date change takes the listing lock; a note edit does not. */
  async update(
    staff: StaffPrincipal | null,
    id: string,
    input: unknown,
  ): Promise<Result<BlockRecord>> {
    const access = authorize(staff, "inventory:block");
    if (!access.ok) return access;
    const parsed = parseBlockPatch(input);
    if (!parsed.ok) {
      return invalid("Some block details need attention.", parsed.issues);
    }
    const actor = access.value;
    const visible = branchScope(actor);
    const patch = parsed.value;

    const preliminary = await this.deps.blocks.findVisible(id, visible);
    if (!preliminary) return failure("NOT_FOUND", BLOCK_NOT_FOUND);

    const outcome =
      patch.endDate !== undefined
        ? await this.changingEnd(actor, preliminary, visible, patch)
        : await this.noteOnly(actor, id, visible, patch);
    return outcome.ok ? success(outcome.value.after) : outcome;
  }

  /** S27: soft cancel under the block row lock; repeating it succeeds quietly. */
  async cancel(
    staff: StaffPrincipal | null,
    id: string,
  ): Promise<Result<void>> {
    const access = authorize(staff, "inventory:block");
    if (!access.ok) return access;
    const actor = access.value;
    const visible = branchScope(actor);
    if (!(await this.deps.blocks.findVisible(id, visible))) {
      return failure("NOT_FOUND", BLOCK_NOT_FOUND);
    }

    const result = await this.deps.unitOfWork.run(async (context) => {
      const locked = await context.blocks.lockVisible(id, visible);
      if (!locked.ok) return locked;
      const current = locked.value;
      if (!current) return failure("NOT_FOUND", BLOCK_NOT_FOUND);
      if (current.cancelledAt) return success(undefined);

      const cancelled = await context.blocks.cancel(id, {
        cancelledById: actor.id,
        at: this.deps.clock.now(),
      });
      if (!cancelled.ok) return cancelled;
      await context.audit.append(
        auditEvent({
          occurredAt: cancelled.value.cancelledAt ?? this.deps.clock.now(),
          actorType: "STAFF",
          actorId: actor.id,
          action: "inventory-block.cancelled",
          entityType: "InventoryBlock",
          entityId: id,
          branchId: current.branchId,
          reason: null,
          changes: {
            physicalRoomId: current.physicalRoomId,
            startDate: current.range.checkIn.value,
            endDate: current.range.checkOut.value,
          },
        }),
      );
      return success(undefined);
    });
    return result;
  }

  private async changingEnd(
    actor: StaffPrincipal,
    preliminary: BlockRecord,
    visible: BranchVisibility,
    patch: BlockPatch,
  ): Promise<Result<UpdateOutcome>> {
    const branchId = preliminary.branchId;
    const roomTypeId = preliminary.roomTypeId;
    const newEnd = patch.endDate as LocalDate;
    if (newEnd.compare(preliminary.range.checkIn) <= 0) {
      return invalid("The block end needs attention.", [
        { path: "endDate", message: "End must be after the start." },
      ]);
    }
    const nextRange = StayRange.create(preliminary.range.checkIn, newEnd);

    return this.guard.execute<ReductionState, unknown, UpdateOutcome>({
      branchId,
      roomTypeIds: [roomTypeId],
      load: async (context) => {
        // Lock order: listing (held), then the block row.
        const locked = await context.blocks.lockVisible(
          preliminary.id,
          visible,
        );
        if (!locked.ok) return locked;
        const current = locked.value;
        if (!current) return failure("NOT_FOUND", BLOCK_NOT_FOUND);
        if (current.cancelledAt) return failure("CONFLICT", CANCELLED);
        const unit = await context.physicalRooms.findVisible(
          current.physicalRoomId,
          [branchId],
        );
        if (!unit) return failure("NOT_FOUND", UNIT_NOT_FOUND);
        const state = await this.reductionState(
          context,
          branchId,
          unit,
          nextRange,
        );
        return state.ok ? success({ ...state.value, current }) : state;
      },
      validate: (state) => {
        const checked = validateInventoryReduction(roomTypeId, {
          unit: { active: state.unit.active, blocks: state.blocks },
          change: {
            kind: "BLOCK",
            range: nextRange,
            replaceBlockId: state.current!.id,
          },
          nights: state.nights,
          assignments: state.assignments,
        });
        if (checked.ok || checked.error.code !== "CONFLICT") return checked;
        // The request can only send endDate, so name that field.
        return checked.error.fieldErrors?.startDate
          ? failure("CONFLICT", checked.error.message, {
              endDate: checked.error.fieldErrors.startDate,
            })
          : checked;
      },
      mutate: async (context, state) => {
        const current = state.current!;
        const endChanged = newEnd.compare(current.range.checkOut) !== 0;
        const noteChanged =
          patch.note !== undefined && patch.note !== current.note;
        if (!endChanged && !noteChanged) {
          return success({ before: current, after: current, changed: false });
        }
        const updated = await context.blocks.update(current.id, {
          ...(endChanged ? { endDate: newEnd } : {}),
          ...(noteChanged ? { note: patch.note ?? null } : {}),
        });
        if (!updated.ok) return updated;
        return success({
          before: current,
          after: updated.value,
          changed: true,
        });
      },
      audit: (context, _state, outcome) =>
        this.recordUpdate(context, actor, outcome),
    });
  }

  private async noteOnly(
    actor: StaffPrincipal,
    id: string,
    visible: BranchVisibility,
    patch: BlockPatch,
  ): Promise<Result<UpdateOutcome>> {
    return this.deps.unitOfWork.run(async (context) => {
      const locked = await context.blocks.lockVisible(id, visible);
      if (!locked.ok) return locked;
      const current = locked.value;
      if (!current) return failure("NOT_FOUND", BLOCK_NOT_FOUND);
      if (current.cancelledAt) return failure("CONFLICT", CANCELLED);
      if (patch.note === undefined || patch.note === current.note) {
        return success({ before: current, after: current, changed: false });
      }
      const updated = await context.blocks.update(id, { note: patch.note });
      if (!updated.ok) return updated;
      const outcome = {
        before: current,
        after: updated.value,
        changed: true,
      };
      await this.recordUpdate(context, actor, outcome);
      return success(outcome);
    });
  }

  /**
   * Reads, after the listing lock, what the reduction check needs. Sold
   * dates come sparsely: only positive consumption intersecting the range.
   */
  private async reductionState(
    context: BlockContext,
    branchId: string,
    unit: PhysicalRoomRecord,
    range: StayRange,
  ): Promise<Result<ReductionState>> {
    const blocks = await context.physicalRooms.listActiveBlocks(unit.id);
    // The consumption port reads from a start date; keep only the range here
    // so the work follows consumption, not the length of the block.
    const sold = await context.consumption.readFutureSold({
      branchId,
      roomTypeId: unit.roomTypeId,
      from: range.checkIn,
    });
    const soldNights = new Map<string, LocalDate>();
    for (const row of sold) {
      if (
        row.sold > 0 &&
        row.night.compare(range.checkIn) >= 0 &&
        row.night.compare(range.checkOut) < 0
      ) {
        soldNights.set(row.night.value, row.night);
      }
    }
    const assignments = await context.consumption.readAssignments({
      branchId,
      physicalRoomId: unit.id,
      window: { kind: "INTERSECTING", range },
    });
    const counted =
      soldNights.size === 0
        ? success([] as const)
        : await context.inventoryReader.readNights({
            branchId,
            roomTypeIds: [unit.roomTypeId],
            nights: [...soldNights.values()],
          });
    if (!counted.ok) return counted;
    return success({ unit, blocks, nights: counted.value, assignments });
  }

  /** One audit event per real state change; none for a no-op patch. */
  private async recordUpdate(
    context: BlockContext,
    actor: StaffPrincipal,
    { before, after, changed }: UpdateOutcome,
  ) {
    if (!changed) return;
    await context.audit.append(
      auditEvent({
        occurredAt: this.deps.clock.now(),
        actorType: "STAFF",
        actorId: actor.id,
        action: "inventory-block.updated",
        entityType: "InventoryBlock",
        entityId: before.id,
        branchId: before.branchId,
        reason: null,
        changes: {
          ...(before.range.checkOut.value !== after.range.checkOut.value
            ? {
                endDate: {
                  from: before.range.checkOut.value,
                  to: after.range.checkOut.value,
                },
              }
            : {}),
          ...(before.note !== after.note ? { noteChanged: true as const } : {}),
        },
      }),
    );
  }
}
