import { authorize } from "@/application/auth/authorize";
import { branchScope } from "@/application/auth/authorize-branch";
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
  mergeRatePeriodRange,
  parseBaseRateInput,
  parseRatePeriodInput,
  parseRatePeriodPatch,
} from "@/domain/pricing";
import type { Money } from "@/domain/shared/money";

import type {
  BaseRateRecord,
  RatePeriodChange,
  RatePeriodRecord,
  RateRepository,
} from "./ports";

export type RateContext = Readonly<{ rates: RateRepository; audit: AuditLog }>;

const LISTING_NOT_FOUND = "This listing was not found.";
const PERIOD_NOT_FOUND = "This rate period was not found.";

const money = (value: Money) => ({
  amountMinor: value.amountMinor,
  currency: "USD" as const,
});

const periodSnapshot = (value: RatePeriodRecord) => ({
  startDate: value.range.checkIn.value,
  endDate: value.range.checkOut.value,
  amount: money(value.amount),
  label: value.label,
  active: value.active,
});

export class ManageRates {
  constructor(
    private readonly deps: Readonly<{
      unitOfWork: ReservationUnitOfWork<RateContext>;
      rates: RateRepository;
      clock: Clock;
      ids: IdGenerator;
    }>,
  ) {}

  async setBaseRate(
    staff: StaffPrincipal | null,
    roomTypeId: string,
    input: unknown,
  ): Promise<Result<BaseRateRecord>> {
    const access = authorize(staff, "pricing:manage");
    if (!access.ok) return access;
    const parsed = parseBaseRateInput(input);
    if (!parsed.ok) {
      return invalid("The base rate needs attention.", parsed.issues);
    }
    const actor = access.value;
    const visible = branchScope(actor);
    const listing = await this.deps.rates.findRoomTypeVisible(
      roomTypeId,
      visible,
    );
    if (!listing) return failure("NOT_FOUND", LISTING_NOT_FOUND);

    return this.deps.unitOfWork.run(async (context) => {
      const changed = await context.rates.setBaseRate(
        {
          roomTypeId,
          amount: parsed.value,
          updatedById: actor.id,
          at: this.deps.clock.now(),
        },
        visible,
      );
      if (!changed.ok) return changed;
      if (!changed.value.changed) return success(changed.value.after);
      await context.audit.append(
        auditEvent({
          occurredAt: changed.value.after.updatedAt,
          actorType: "STAFF",
          actorId: actor.id,
          action: "room-base-rate.updated",
          entityType: "RoomBaseRate",
          entityId: roomTypeId,
          branchId: listing.branchId,
          reason: null,
          changes: {
            before: changed.value.before
              ? money(changed.value.before.amount)
              : null,
            after: money(changed.value.after.amount),
          },
        }),
      );
      return success(changed.value.after);
    });
  }

  async createPeriod(
    staff: StaffPrincipal | null,
    roomTypeId: string,
    input: unknown,
  ): Promise<Result<RatePeriodRecord>> {
    const access = authorize(staff, "pricing:manage");
    if (!access.ok) return access;
    const parsed = parseRatePeriodInput(input);
    if (!parsed.ok) {
      return invalid("The rate period needs attention.", parsed.issues);
    }
    const actor = access.value;
    const visible = branchScope(actor);
    const listing = await this.deps.rates.findRoomTypeVisible(
      roomTypeId,
      visible,
    );
    if (!listing) return failure("NOT_FOUND", LISTING_NOT_FOUND);

    return this.deps.unitOfWork.run(async (context) => {
      if (!(await context.rates.findRoomTypeVisible(roomTypeId, visible))) {
        return failure("NOT_FOUND", LISTING_NOT_FOUND);
      }
      const created = await context.rates.createPeriod({
        id: this.deps.ids.next(),
        roomTypeId,
        ...parsed.value,
        updatedById: actor.id,
        at: this.deps.clock.now(),
      });
      if (!created.ok) return created;
      await context.audit.append(
        auditEvent({
          occurredAt: created.value.createdAt,
          actorType: "STAFF",
          actorId: actor.id,
          action: "rate-period.created",
          entityType: "RatePeriod",
          entityId: created.value.id,
          branchId: listing.branchId,
          reason: null,
          changes: { before: null, after: periodSnapshot(created.value) },
        }),
      );
      return created;
    });
  }

  async updatePeriod(
    staff: StaffPrincipal | null,
    id: string,
    input: unknown,
  ): Promise<Result<RatePeriodRecord>> {
    const access = authorize(staff, "pricing:manage");
    if (!access.ok) return access;
    const parsed = parseRatePeriodPatch(input);
    if (!parsed.ok) {
      return invalid("The rate period needs attention.", parsed.issues);
    }
    const actor = access.value;
    const visible = branchScope(actor);
    const preliminary = await this.deps.rates.findPeriodVisible(id, visible);
    if (!preliminary) return failure("NOT_FOUND", PERIOD_NOT_FOUND);

    return this.deps.unitOfWork.run(async (context) => {
      const locked = await context.rates.lockPeriodVisible(id, visible);
      if (!locked.ok) return locked;
      if (!locked.value) return failure("NOT_FOUND", PERIOD_NOT_FOUND);
      const before = locked.value;
      const range = mergeRatePeriodRange(before.range, parsed.value);
      if (!range.ok) {
        return invalid("The rate period needs attention.", range.issues);
      }
      const change: RatePeriodChange = {
        ...(range.value.checkIn.value !== before.range.checkIn.value ||
        range.value.checkOut.value !== before.range.checkOut.value
          ? { range: range.value }
          : {}),
        ...(parsed.value.amount !== undefined &&
        parsed.value.amount.amountMinor !== before.amount.amountMinor
          ? { amount: parsed.value.amount }
          : {}),
        ...(parsed.value.label !== undefined &&
        parsed.value.label !== before.label
          ? { label: parsed.value.label }
          : {}),
        ...(parsed.value.active !== undefined &&
        parsed.value.active !== before.active
          ? { active: parsed.value.active }
          : {}),
        updatedById: actor.id,
        at: this.deps.clock.now(),
      };
      const hasChange =
        change.range !== undefined ||
        change.amount !== undefined ||
        change.label !== undefined ||
        change.active !== undefined;
      if (!hasChange) return success(before);
      const updated = await context.rates.updatePeriod(id, change);
      if (!updated.ok) return updated;
      await context.audit.append(
        auditEvent({
          occurredAt: updated.value.updatedAt,
          actorType: "STAFF",
          actorId: actor.id,
          action: "rate-period.updated",
          entityType: "RatePeriod",
          entityId: id,
          branchId: before.branchId,
          reason: null,
          changes: {
            before: periodSnapshot(before),
            after: periodSnapshot(updated.value),
          },
        }),
      );
      return updated;
    });
  }

  async deactivatePeriod(
    staff: StaffPrincipal | null,
    id: string,
  ): Promise<Result<void>> {
    const result = await this.updatePeriod(staff, id, { active: false });
    return result.ok ? success(undefined) : result;
  }
}
