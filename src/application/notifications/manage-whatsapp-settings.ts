import type { AuditLog } from "@/application/audit";
import { type StaffPrincipal, authorize } from "@/application/auth";
import type { ReservationUnitOfWork } from "@/application/reservations";
import type { Clock } from "@/application/shared/providers";
import { invalid, success, type Result } from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import { parseWhatsAppSettingsInput } from "@/domain/notifications";

import type { WhatsAppSettingsRepository } from "./ports";
import type { WhatsAppSetupReader, WhatsAppSetupView } from "./whatsapp-setup";

export type WhatsAppSettingsContext = Readonly<{
  settings: WhatsAppSettingsRepository;
  audit: AuditLog;
}>;

/**
 * The Admin's WhatsApp setup (API-A6, Q-67). `settings:edit` is held by
 * Admin only. The access token is a server secret: it is never accepted,
 * stored, or returned, only reported as configured or not.
 */
export class ManageWhatsAppSettings {
  constructor(
    private readonly deps: Readonly<{
      unitOfWork: ReservationUnitOfWork<WhatsAppSettingsContext>;
      setup: WhatsAppSetupReader;
      clock: Clock;
    }>,
  ) {}

  async read(staff: StaffPrincipal | null): Promise<Result<WhatsAppSetupView>> {
    const access = authorize(staff, "settings:edit");
    if (!access.ok) return access;
    return success(await this.deps.setup.read());
  }

  /** Clearing the number is allowed; sending then stops (Q-71). */
  async update(
    staff: StaffPrincipal | null,
    input: unknown,
  ): Promise<Result<WhatsAppSetupView>> {
    const access = authorize(staff, "settings:edit");
    if (!access.ok) return access;
    const parsed = parseWhatsAppSettingsInput(input);
    if (!parsed.ok) {
      return invalid("The WhatsApp settings need attention.", parsed.issues);
    }
    const actor = access.value;

    const written = await this.deps.unitOfWork.run(async (context) => {
      const result = await context.settings.update({
        input: parsed.value,
        updatedById: actor.id,
        now: () => this.deps.clock.now(),
      });
      if (!result.ok) return result;
      const { before, after, changed } = result.value;
      if (!changed) return success(undefined);
      const changes: {
        businessPhoneNumber?: { from: string | null; to: string | null };
        providerPhoneNumberId?: { from: string | null; to: string | null };
      } = {};
      if (before.businessPhoneNumber !== after.businessPhoneNumber) {
        changes.businessPhoneNumber = {
          from: before.businessPhoneNumber,
          to: after.businessPhoneNumber,
        };
      }
      if (before.providerPhoneNumberId !== after.providerPhoneNumberId) {
        changes.providerPhoneNumberId = {
          from: before.providerPhoneNumberId,
          to: after.providerPhoneNumberId,
        };
      }
      await context.audit.append(
        auditEvent({
          occurredAt: after.updatedAt,
          actorType: "STAFF",
          actorId: actor.id,
          action: "whatsapp-settings.updated",
          entityType: "WhatsAppSettings",
          entityId: "default",
          branchId: null,
          reason: null,
          changes,
        }),
      );
      return success(undefined);
    });
    if (!written.ok) return written;
    return success(await this.deps.setup.read());
  }
}
