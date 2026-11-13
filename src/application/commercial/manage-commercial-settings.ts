import type { AuditLog } from "@/application/audit";
import { authorize } from "@/application/auth/authorize";
import type { StaffPrincipal } from "@/application/auth/ports";
import type { Clock } from "@/application/ports/providers";
import type { ReservationUnitOfWork } from "@/application/reservations";
import { invalid, success, type Result } from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import { parseCommercialSettingsInput } from "@/domain/settings/vat-rate";

import type {
  CommercialSettingsRecord,
  CommercialSettingsRepository,
} from "./ports";

export type CommercialSettingsContext = Readonly<{
  settings: CommercialSettingsRepository;
  audit: AuditLog;
}>;

/**
 * The VAT rate (API-A5). Reading needs `pricing:read`; changing it needs
 * `tax:manage`, held by Admin only. The rate is never null and applies to
 * later quotes only (TX-5).
 */
export class ManageCommercialSettings {
  constructor(
    private readonly deps: Readonly<{
      unitOfWork: ReservationUnitOfWork<CommercialSettingsContext>;
      settings: CommercialSettingsRepository;
      clock: Clock;
    }>,
  ) {}

  async read(
    staff: StaffPrincipal | null,
  ): Promise<Result<CommercialSettingsRecord>> {
    const access = authorize(staff, "pricing:read");
    if (!access.ok) return access;
    return success(await this.deps.settings.read());
  }

  async update(
    staff: StaffPrincipal | null,
    input: unknown,
  ): Promise<Result<CommercialSettingsRecord>> {
    const access = authorize(staff, "tax:manage");
    if (!access.ok) return access;
    const parsed = parseCommercialSettingsInput(input);
    if (!parsed.ok) {
      return invalid("The VAT rate needs attention.", parsed.issues);
    }
    const actor = access.value;

    return this.deps.unitOfWork.run(async (context) => {
      const written = await context.settings.update({
        vatRateBasisPoints: parsed.value.vatRateBasisPoints,
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
          action: "commercial.update",
          entityType: "CommercialSettings",
          entityId: "default",
          branchId: null,
          reason: null,
          changes: {
            vatRateBasisPoints: {
              from: before.vatRateBasisPoints,
              to: after.vatRateBasisPoints,
            },
          },
        }),
      );
      return success(after);
    });
  }
}
