import { z } from "zod";

import type { AuditLog } from "@/application/audit";
import { authorize } from "@/application/auth/authorize";
import {
  authorizeBranch,
  branchScope,
  type BranchScope,
} from "@/application/auth/authorize-branch";
import type { StaffPrincipal } from "@/application/auth/ports";
import type { Clock, IdGenerator } from "@/application/ports/providers";
import type { ReservationUnitOfWork } from "@/application/reservations";
import {
  failure,
  invalid,
  success,
  type Result,
} from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import {
  couponInputData,
  parseCouponInput,
  parseCouponPatch,
  type CouponInput,
} from "@/domain/coupons";
import { issuesFromZod } from "@/domain/shared/domain-error";
import type { CouponPage, CouponRepository, ManagedCoupon } from "./ports";

export type CouponContext = Readonly<{
  coupons: CouponRepository;
  audit: AuditLog;
}>;
const querySchema = z
  .object({
    branchId: z.string().min(1).max(32).optional(),
    active: z.boolean().optional(),
    q: z.string().trim().max(32).optional(),
    page: z.number().int().min(1).max(1_000_000).default(1),
  })
  .strict();
function visible(scope: BranchScope, coupon: CouponInput) {
  return (
    scope === "ALL" ||
    (!coupon.allBranches &&
      coupon.branchIds.length > 0 &&
      coupon.branchIds.every((id) => scope.includes(id)))
  );
}
function snapshot(value: CouponInput) {
  const { description: _description, ...data } = couponInputData(value);
  void _description;
  return data;
}

export class ManageCoupons {
  constructor(
    private readonly deps: Readonly<{
      coupons: CouponRepository;
      unitOfWork: ReservationUnitOfWork<CouponContext>;
      clock: Clock;
      ids: IdGenerator;
    }>,
  ) {}

  async list(
    staff: StaffPrincipal | null,
    input: unknown,
  ): Promise<Result<CouponPage>> {
    const access = authorize(staff, "coupons:manage");
    if (!access.ok) return access;
    const parsed = querySchema.safeParse(input);
    if (!parsed.success)
      return invalid(
        "The filters need attention.",
        issuesFromZod(parsed.error.issues),
      );
    if (parsed.data.branchId) {
      const branch = authorizeBranch(
        access.value,
        "coupons:manage",
        parsed.data.branchId,
      );
      if (!branch.ok) return branch;
    }
    return success(
      await this.deps.coupons.list(branchScope(access.value), parsed.data),
    );
  }

  private scope(
    staff: StaffPrincipal,
    value: CouponInput,
  ): Result<StaffPrincipal> {
    if (staff.role !== "ADMIN" && value.allBranches)
      return failure("FORBIDDEN", "You cannot manage global coupons.");
    for (const id of value.branchIds) {
      const access = authorizeBranch(staff, "coupons:manage", id);
      if (!access.ok) return access;
    }
    return success(staff);
  }

  async create(
    staff: StaffPrincipal | null,
    input: unknown,
  ): Promise<Result<ManagedCoupon>> {
    const access = authorize(staff, "coupons:manage");
    if (!access.ok) return access;
    const parsed = parseCouponInput(input);
    if (!parsed.ok)
      return invalid("The coupon needs attention.", parsed.issues);
    const scoped = this.scope(access.value, parsed.value);
    if (!scoped.ok) return scoped;
    return this.deps.unitOfWork.run(async ({ coupons, audit }) => {
      if (!(await coupons.branchesExist(parsed.value.branchIds)))
        return failure("VALIDATION", "Choose existing branches.", {
          branchIds: ["A branch was not found."],
        });
      const written = await coupons.create(
        this.deps.ids.next(),
        parsed.value,
        access.value.id,
        this.deps.clock.now(),
      );
      if (!written.ok) return written;
      await audit.append(
        auditEvent({
          occurredAt: written.value.updatedAt,
          actorType: "STAFF",
          actorId: access.value.id,
          action: "coupon.create",
          entityType: "Coupon",
          entityId: written.value.id,
          branchId: null,
          reason: null,
          changes: {
            before: null,
            after: snapshot(written.value),
            descriptionChanged: written.value.description !== null,
          },
        }),
      );
      return written;
    });
  }

  async update(
    staff: StaffPrincipal | null,
    id: string,
    input: unknown,
  ): Promise<Result<ManagedCoupon>> {
    const access = authorize(staff, "coupons:manage");
    if (!access.ok) return access;
    if (!id || id.length > 32)
      return failure("NOT_FOUND", "This coupon was not found.");
    const patch = parseCouponPatch(input);
    if (!patch.ok) return invalid("The coupon needs attention.", patch.issues);
    return this.deps.unitOfWork.run(async ({ coupons, audit }) => {
      const locked = await coupons.lock(id);
      if (!locked.ok) return locked;
      const before = locked.value;
      if (!before || !visible(branchScope(access.value), before))
        return failure("NOT_FOUND", "This coupon was not found.");
      const currentScope = this.scope(access.value, before);
      if (!currentScope.ok) return currentScope;
      const parsed = parseCouponInput({
        ...couponInputData(before),
        ...patch.value,
      });
      if (!parsed.ok)
        return invalid("The coupon needs attention.", parsed.issues);
      const scoped = this.scope(access.value, parsed.value);
      if (!scoped.ok) return scoped;
      if (!(await coupons.branchesExist(parsed.value.branchIds)))
        return failure("VALIDATION", "Choose existing branches.", {
          branchIds: ["A branch was not found."],
        });
      if (
        JSON.stringify(couponInputData(before)) ===
        JSON.stringify(couponInputData(parsed.value))
      )
        return success(before);
      const after = await coupons.replace(
        id,
        parsed.value,
        access.value.id,
        this.deps.clock.now(),
      );
      await audit.append(
        auditEvent({
          occurredAt: after.updatedAt,
          actorType: "STAFF",
          actorId: access.value.id,
          action: "coupon.update",
          entityType: "Coupon",
          entityId: id,
          branchId: null,
          reason: null,
          changes: {
            before: snapshot(before),
            after: snapshot(after),
            descriptionChanged: before.description !== after.description,
          },
        }),
      );
      return success(after);
    });
  }
}
