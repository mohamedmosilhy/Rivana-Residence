import type { AuditLog } from "@/application/audit";
import { authorizeBranch } from "@/application/auth/authorize-branch";
import type { StaffPrincipal } from "@/application/auth/ports";
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
  SERVICE_KINDS,
  parseServiceKind,
  parseServiceOfferingInput,
} from "@/domain/services";
import type { Money } from "@/domain/shared/money";

import type {
  ServiceCatalogEntry,
  ServiceOfferingRecord,
  ServiceOfferingRepository,
} from "./ports";

export type ServiceContext = Readonly<{
  services: ServiceOfferingRepository;
  audit: AuditLog;
}>;

const BRANCH_NOT_FOUND = "This branch was not found.";

const money = (value: Money) => ({
  amountMinor: value.amountMinor,
  currency: "USD" as const,
});

function snapshot(record: ServiceOfferingRecord) {
  return {
    priceUnit: record.priceUnit,
    price: money(record.price),
    childPrice: record.childPrice ? money(record.childPrice) : null,
    active: record.active,
  };
}

/**
 * Branch service offerings (API-S35, S36). Authorization and the branch scope
 * run before any repository call. Pricing and service edits never reduce
 * availability, so they take only their own row lock, not an inventory lock.
 */
export class ManageServices {
  constructor(
    private readonly deps: Readonly<{
      unitOfWork: ReservationUnitOfWork<ServiceContext>;
      services: ServiceOfferingRepository;
      clock: Clock;
      ids: IdGenerator;
    }>,
  ) {}

  /** S35: both kinds, with kinds that have no offering shown as absent. */
  async list(
    staff: StaffPrincipal | null,
    branchId: string,
  ): Promise<Result<readonly ServiceCatalogEntry[]>> {
    const access = authorizeBranch(staff, "pricing:read", branchId);
    if (!access.ok) return access;
    if (!(await this.deps.services.branchExists(branchId))) {
      return failure("NOT_FOUND", BRANCH_NOT_FOUND);
    }
    const stored = await this.deps.services.listByBranch(branchId);
    return success(
      SERVICE_KINDS.map((kind) => ({
        kind,
        offering: stored.find((record) => record.kind === kind) ?? null,
      })),
    );
  }

  /** S36: create or replace one offering; an identical write is not audited. */
  async set(
    staff: StaffPrincipal | null,
    branchId: string,
    kindInput: unknown,
    input: unknown,
  ): Promise<Result<ServiceOfferingRecord>> {
    const access = authorizeBranch(staff, "services:manage", branchId);
    if (!access.ok) return access;
    const kind = parseServiceKind(kindInput);
    if (!kind.ok) return invalid("Choose a supported service.", kind.issues);
    const parsed = parseServiceOfferingInput(input);
    if (!parsed.ok) {
      return invalid("The service needs attention.", parsed.issues);
    }
    if (!(await this.deps.services.branchExists(branchId))) {
      return failure("NOT_FOUND", BRANCH_NOT_FOUND);
    }
    const actor = access.value;

    return this.deps.unitOfWork.run(async (context) => {
      const written = await context.services.upsert({
        id: this.deps.ids.next(),
        branchId,
        kind: kind.value,
        input: parsed.value,
        updatedById: actor.id,
        now: () => this.deps.clock.now(),
      });
      if (!written.ok) return written;
      const { before, after, changed } = written.value;
      if (!changed) return success(after);
      await context.audit.append(
        auditEvent({
          occurredAt: after.updatedAt,
          actorType: "STAFF",
          actorId: actor.id,
          action: "service.update",
          entityType: "ServiceOffering",
          entityId: after.id,
          branchId,
          reason: null,
          changes: {
            kind: kind.value,
            before: before ? snapshot(before) : null,
            after: snapshot(after),
            descriptionChanged:
              (before?.description ?? null) !== after.description,
          },
        }),
      );
      return success(after);
    });
  }
}
