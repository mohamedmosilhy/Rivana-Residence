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
  parsePhysicalRoomInput,
  parsePhysicalRoomPatch,
  type PhysicalRoomPatch,
} from "@/domain/inventory";
import { localDateAt } from "@/domain/shared/zoned-time";
import type { LocalDate } from "@/domain/shared/local-date";
import type { StayRange } from "@/domain/shared/stay-range";

import {
  InventoryGuard,
  validateInventoryReduction,
  type InventoryGuardContext,
} from "./inventory-guard";
import type {
  ActiveBlockRange,
  BranchVisibility,
  InventoryNightRecord,
  InventoryLock,
  InventoryReader,
  PhysicalRoomRecord,
  PhysicalRoomRepository,
  ReservationConsumptionReader,
  RoomTypeCatalog,
} from "./ports";

/** The ports bound to one transaction for physical unit writes (M6-T5). */
export type PhysicalRoomContext = InventoryGuardContext &
  Readonly<{
    inventoryLock: InventoryLock;
    inventoryReader: InventoryReader;
    consumption: ReservationConsumptionReader;
    physicalRooms: PhysicalRoomRepository;
    audit: AuditLog;
  }>;

const UNIT_NOT_FOUND = "This unit was not found.";
const BRANCH_NOT_FOUND = "This branch was not found.";

type DeactivationState = Readonly<{
  unit: PhysicalRoomRecord;
  blocks: readonly ActiveBlockRange[];
  today: LocalDate;
  assignments: readonly StayRange[];
  nights: readonly InventoryNightRecord[];
}>;

type Outcome = Readonly<{
  before: PhysicalRoomRecord;
  after: PhysicalRoomRecord;
  changed: boolean;
}>;

/**
 * Physical unit administration (API-S21 to S23). Creating or activating a
 * unit adds capacity and needs no inventory lock. Any request that asks to
 * deactivate goes through the `InventoryGuard`, even when a preliminary read
 * says the unit is already inactive, so a racing activation cannot slip in.
 */
export class ManagePhysicalRooms {
  private readonly guard: InventoryGuard<PhysicalRoomContext>;

  constructor(
    private readonly deps: Readonly<{
      unitOfWork: ReservationUnitOfWork<PhysicalRoomContext>;
      rooms: PhysicalRoomRepository;
      catalog: RoomTypeCatalog;
      clock: Clock;
      ids: IdGenerator;
    }>,
  ) {
    this.guard = new InventoryGuard(deps.unitOfWork);
  }

  /** S21: every unit of an explicit branch, inactive ones included. */
  async list(
    staff: StaffPrincipal | null,
    branchId: string,
  ): Promise<Result<readonly PhysicalRoomRecord[]>> {
    const access = authorizeBranch(staff, "inventory:read", branchId);
    if (!access.ok) return access;
    if (!(await this.deps.catalog.findBranch(branchId))) {
      return failure("NOT_FOUND", BRANCH_NOT_FOUND);
    }
    return success(await this.deps.rooms.listByBranch(branchId));
  }

  /** S22: adds capacity, so it takes no listing lock. */
  async create(
    staff: StaffPrincipal | null,
    branchId: string,
    input: unknown,
  ): Promise<Result<PhysicalRoomRecord>> {
    const access = authorizeBranch(staff, "inventory:manage", branchId);
    if (!access.ok) return access;
    const parsed = parsePhysicalRoomInput(input);
    if (!parsed.ok) {
      return invalid("Some unit details need attention.", parsed.issues);
    }
    if (!(await this.deps.catalog.findBranch(branchId))) {
      return failure("NOT_FOUND", BRANCH_NOT_FOUND);
    }
    const { roomTypeId, label, notes } = parsed.value;
    if (!(await this.deps.catalog.branchOwnsRoomType(branchId, roomTypeId))) {
      return failure("NOT_FOUND", "This listing was not found in the branch.");
    }

    const actor = access.value;
    return this.deps.unitOfWork.run(async (context) => {
      const at = this.deps.clock.now();
      const created = await context.physicalRooms.create({
        id: this.deps.ids.next(),
        branchId,
        roomTypeId,
        label,
        notes,
        createdById: actor.id,
        at,
      });
      if (!created.ok) return created;
      await context.audit.append(
        auditEvent({
          occurredAt: at,
          actorType: "STAFF",
          actorId: actor.id,
          action: "physical-room.created",
          entityType: "PhysicalRoom",
          entityId: created.value.id,
          branchId,
          reason: null,
          changes: {
            roomTypeId,
            label: created.value.label,
            active: created.value.active,
            notesChanged: created.value.notes !== null,
          },
        }),
      );
      return created;
    });
  }

  /** S23: label, notes, and activity. Ownership never changes. */
  async update(
    staff: StaffPrincipal | null,
    id: string,
    input: unknown,
  ): Promise<Result<PhysicalRoomRecord>> {
    const access = authorize(staff, "inventory:manage");
    if (!access.ok) return access;
    const parsed = parsePhysicalRoomPatch(input);
    if (!parsed.ok) {
      return invalid("Some unit details need attention.", parsed.issues);
    }
    const actor = access.value;
    const visible: BranchVisibility = branchScope(actor);
    const patch = parsed.value;

    const preliminary = await this.deps.rooms.findVisible(id, visible);
    if (!preliminary) return failure("NOT_FOUND", UNIT_NOT_FOUND);

    const outcome =
      patch.active === false
        ? await this.deactivating(actor, preliminary, visible, patch)
        : await this.plainUpdate(actor, id, visible, patch);
    return outcome.ok ? success(outcome.value.after) : outcome;
  }

  private async plainUpdate(
    actor: StaffPrincipal,
    id: string,
    visible: BranchVisibility,
    patch: PhysicalRoomPatch,
  ): Promise<Result<Outcome>> {
    return this.deps.unitOfWork.run(async (context) => {
      const locked = await context.physicalRooms.lockVisible(id, visible);
      if (!locked.ok) return locked;
      const current = locked.value;
      if (!current) return failure("NOT_FOUND", UNIT_NOT_FOUND);
      const applied = await this.apply(context, actor, current, patch);
      if (!applied.ok) return applied;
      await this.recordAudit(context, actor, applied.value);
      return applied;
    });
  }

  private async deactivating(
    actor: StaffPrincipal,
    preliminary: PhysicalRoomRecord,
    visible: BranchVisibility,
    patch: PhysicalRoomPatch,
  ): Promise<Result<Outcome>> {
    const branch = await this.deps.catalog.findBranch(preliminary.branchId);
    if (!branch) return failure("NOT_FOUND", UNIT_NOT_FOUND);
    const branchId = preliminary.branchId;
    const roomTypeId = preliminary.roomTypeId;

    return this.guard.execute<DeactivationState, unknown, Outcome>({
      branchId,
      roomTypeIds: [roomTypeId],
      // Everything below runs after the listing lock, so it sees the state
      // committed by whoever held the lock before us.
      load: async (context) => {
        const locked = await context.physicalRooms.lockVisible(
          preliminary.id,
          visible,
        );
        if (!locked.ok) return locked;
        const unit = locked.value;
        if (!unit) return failure("NOT_FOUND", UNIT_NOT_FOUND);
        const blocks = await context.physicalRooms.listActiveBlocks(unit.id);
        const today = localDateAt(this.deps.clock.now(), branch.timeZone);
        const sold = await context.consumption.readFutureSold({
          branchId,
          roomTypeId,
          from: today,
        });
        const assignments = await context.consumption.readAssignments({
          branchId,
          physicalRoomId: unit.id,
          window: { kind: "FROM", from: today },
        });
        const soldNights = new Map<string, LocalDate>();
        for (const row of sold) {
          if (row.sold > 0) soldNights.set(row.night.value, row.night);
        }
        const counted =
          soldNights.size === 0
            ? success([] as const)
            : await context.inventoryReader.readNights({
                branchId,
                roomTypeIds: [roomTypeId],
                nights: [...soldNights.values()],
              });
        if (!counted.ok) return counted;
        return success({
          unit,
          blocks,
          today,
          assignments,
          nights: counted.value,
        });
      },
      validate: (state) =>
        validateInventoryReduction(roomTypeId, {
          unit: { active: state.unit.active, blocks: state.blocks },
          change: { kind: "DEACTIVATE", from: state.today },
          nights: state.nights,
          assignments: state.assignments,
        }),
      mutate: (context, state) => this.apply(context, actor, state.unit, patch),
      audit: (context, _state, outcome) =>
        this.recordAudit(context, actor, outcome),
    });
  }

  /** Applies the patch to the locked row. No audit until `recordAudit`. */
  private async apply(
    context: PhysicalRoomContext,
    actor: StaffPrincipal,
    current: PhysicalRoomRecord,
    patch: PhysicalRoomPatch,
  ): Promise<Result<Outcome>> {
    const labelChanged =
      patch.label !== undefined && patch.label !== current.label;
    const notesChanged =
      patch.notes !== undefined && patch.notes !== current.notes;
    const activeChanged =
      patch.active !== undefined && patch.active !== current.active;
    if (!labelChanged && !notesChanged && !activeChanged) {
      return success({ before: current, after: current, changed: false });
    }

    const at = this.deps.clock.now();
    const updated = await context.physicalRooms.update(current.id, {
      ...(labelChanged ? { label: patch.label! } : {}),
      ...(notesChanged ? { notes: patch.notes ?? null } : {}),
      ...(activeChanged ? { active: patch.active! } : {}),
      updatedById: actor.id,
      at,
    });
    if (!updated.ok) return updated;
    return success({ before: current, after: updated.value, changed: true });
  }

  /** One audit event per real state change; none for a no-op patch. */
  private async recordAudit(
    context: PhysicalRoomContext,
    actor: StaffPrincipal,
    { before, after, changed }: Outcome,
  ) {
    if (!changed) return;
    await context.audit.append(
      auditEvent({
        occurredAt: after.updatedAt,
        actorType: "STAFF",
        actorId: actor.id,
        action: "physical-room.updated",
        entityType: "PhysicalRoom",
        entityId: before.id,
        branchId: before.branchId,
        reason: null,
        changes: {
          ...(before.label !== after.label
            ? { label: { from: before.label, to: after.label } }
            : {}),
          ...(before.active !== after.active
            ? { active: { from: before.active, to: after.active } }
            : {}),
          ...(before.notes !== after.notes
            ? { notesChanged: true as const }
            : {}),
        },
      }),
    );
  }
}
