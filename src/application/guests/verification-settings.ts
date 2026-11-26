import { z } from "zod";

import type { AuditLog } from "@/application/audit";
import { type StaffPrincipal, authorize } from "@/application/auth";
import type { ReservationUnitOfWork } from "@/application/reservations";
import type { Clock } from "@/application/shared/providers";
import { invalid, success, type Result } from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import { issuesFromZod } from "@/domain/shared/domain-error";

import type { VerificationSettingsRepository } from "./ports";

export type VerificationSettingsContext = Readonly<{
  settings: VerificationSettingsRepository;
  audit: AuditLog;
}>;

export type VerificationSettingsView = Readonly<{
  /** The Admin switch (Q-99). */
  emailVerificationEnabled: boolean;
  /** Whether the email adapter can deliver (deployment configuration). */
  emailDeliveryConfigured: boolean;
  /** Whether a payment gateway is configured; email bookings need it (Q-100). */
  onlinePaymentConfigured: boolean;
  /** Whether WhatsApp is configured per Q-71. */
  whatsAppConfigured: boolean;
  /** Email codes are offered only when delivery is configured and the switch is on. */
  emailChannelReady: boolean;
  /** Null when the settings row is missing (read as off). */
  updatedAt: Date | null;
}>;

export const EMAIL_VERIFICATION_NEEDS_DELIVERY_MESSAGE =
  "Email verification can't be turned on until email delivery is set up.";
export const EMAIL_VERIFICATION_NEEDS_PAYMENT_MESSAGE =
  "Email verification can't be turned on until online payment is set up: bookings verified by email are paid online.";

const input = z.object({ emailVerificationEnabled: z.boolean() }).strict();

/**
 * The Admin's switch for verification codes by email (API-A9, Q-99,
 * spec 0006 Decision 9). One global setting, off by default. Turning it on is
 * refused while email delivery or online payment is not configured (a booking
 * verified by email is paid online, Q-100). Turning it off stops new email
 * codes; codes and tokens already issued may finish.
 */
export class ManageVerificationSettings {
  constructor(
    private readonly deps: Readonly<{
      unitOfWork: ReservationUnitOfWork<VerificationSettingsContext>;
      settings: Pick<VerificationSettingsRepository, "read">;
      emailDelivery: { isConfigured(): boolean };
      onlinePayment: { isConfigured(): boolean };
      whatsApp: { isConfigured(): Promise<boolean> };
      clock: Clock;
    }>,
  ) {}

  async read(
    staff: StaffPrincipal | null,
  ): Promise<Result<VerificationSettingsView>> {
    const access = authorize(staff, "settings:edit");
    if (!access.ok) return access;
    return success(await this.view());
  }

  async update(
    staff: StaffPrincipal | null,
    body: unknown,
  ): Promise<Result<VerificationSettingsView>> {
    const access = authorize(staff, "settings:edit");
    if (!access.ok) return access;
    const parsed = input.safeParse(body);
    if (!parsed.success)
      return invalid(
        "The verification settings need attention.",
        issuesFromZod(parsed.error.issues),
      );
    const enable = parsed.data.emailVerificationEnabled;
    const missing = !enable
      ? []
      : [
          ...(this.deps.emailDelivery.isConfigured()
            ? []
            : [EMAIL_VERIFICATION_NEEDS_DELIVERY_MESSAGE]),
          ...(this.deps.onlinePayment.isConfigured()
            ? []
            : [EMAIL_VERIFICATION_NEEDS_PAYMENT_MESSAGE]),
        ];
    if (missing.length > 0)
      return invalid(
        "The verification settings need attention.",
        missing.map((message) => ({
          path: "emailVerificationEnabled",
          message,
        })),
      );
    const actor = access.value;
    const written = await this.deps.unitOfWork.run(async (context) => {
      const result = await context.settings.update({
        emailEnabled: enable,
        updatedById: actor.id,
        now: () => this.deps.clock.now(),
      });
      if (!result.ok) return result;
      const { before, after, changed } = result.value;
      if (!changed) return success(undefined);
      await context.audit.append(
        auditEvent({
          occurredAt: after.updatedAt,
          actorType: "STAFF",
          actorId: actor.id,
          action: "verification-settings.updated",
          entityType: "VerificationSettings",
          entityId: "default",
          branchId: null,
          reason: null,
          changes: {
            emailVerificationEnabled: {
              from: before.emailEnabled,
              to: after.emailEnabled,
            },
          },
        }),
      );
      return success(undefined);
    });
    if (!written.ok) return written;
    return success(await this.view());
  }

  private async view(): Promise<VerificationSettingsView> {
    const [record, whatsAppConfigured] = await Promise.all([
      this.deps.settings.read(),
      this.deps.whatsApp.isConfigured(),
    ]);
    const emailDeliveryConfigured = this.deps.emailDelivery.isConfigured();
    const enabled = record?.emailEnabled === true;
    return {
      emailVerificationEnabled: enabled,
      emailDeliveryConfigured,
      onlinePaymentConfigured: this.deps.onlinePayment.isConfigured(),
      whatsAppConfigured,
      emailChannelReady: emailDeliveryConfigured && enabled,
      updatedAt: record?.updatedAt ?? null,
    };
  }
}
