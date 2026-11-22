import type { AuditLog } from "@/application/audit";
import { type StaffPrincipal, authorize } from "@/application/auth";
import type { ReservationUnitOfWork } from "@/application/reservations";
import type { Clock } from "@/application/shared/providers";
import {
  failure,
  invalid,
  rateLimited,
  success,
  type Result,
} from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import {
  WHATSAPP_SAMPLE_VARIABLES,
  WHATSAPP_SEND_LANGUAGE,
  parseWhatsAppTestMessageInput,
} from "@/domain/notifications";

import type {
  StaffActionLimiter,
  WhatsAppSendResult,
  WhatsAppSettingsRepository,
  WhatsAppTemplateRepository,
} from "./ports";
import {
  WHATSAPP_TEMPLATE_MISSING_DETAIL,
  type TemplateWhatsAppSender,
} from "./template-whatsapp-sender";

export type WhatsAppTestContext = Readonly<{
  settings: WhatsAppSettingsRepository;
  audit: AuditLog;
}>;

export type WhatsAppTestResult = Readonly<{ providerMessageId: string }>;

const TOO_MANY = "Too many test messages. Wait a few minutes, then try again.";

/**
 * The Admin's test message (API-A8, Q-67). It sends the chosen template, or
 * the active `en` TEST template, filled with fake sample values, so the
 * Admin sees whether Meta accepts the name and variables. Limited to 5 per
 * 10 minutes per Admin; the send happens outside any transaction, then the
 * outcome is stored on the settings row and audited without the recipient.
 */
export class SendWhatsAppTestMessage {
  constructor(
    private readonly deps: Readonly<{
      unitOfWork: ReservationUnitOfWork<WhatsAppTestContext>;
      templates: WhatsAppTemplateRepository;
      sender: TemplateWhatsAppSender;
      limiter: StaffActionLimiter;
      clock: Clock;
    }>,
  ) {}

  async execute(
    staff: StaffPrincipal | null,
    input: unknown,
  ): Promise<Result<WhatsAppTestResult>> {
    const access = authorize(staff, "settings:edit");
    if (!access.ok) return access;
    const parsed = parseWhatsAppTestMessageInput(input);
    if (!parsed.ok) {
      return invalid("The test message needs attention.", parsed.issues);
    }
    const actor = access.value;
    const admitted = await this.deps.limiter.consume(actor.id);
    if (!admitted.allowed) {
      return rateLimited(TOO_MANY, admitted.retryAfterSeconds);
    }

    const { phone, templateId } = parsed.value;
    const template = templateId
      ? await this.deps.templates.findById(templateId)
      : await this.deps.templates.findActive("TEST", WHATSAPP_SEND_LANGUAGE);
    if (templateId && !template) {
      return failure("NOT_FOUND", "This template was not found.");
    }
    const sent: WhatsAppSendResult = template
      ? await this.deps.sender.sendTemplate(
          template,
          phone,
          WHATSAPP_SAMPLE_VARIABLES,
        )
      : {
          ok: false,
          code: "TEMPLATE_MISSING",
          detail: WHATSAPP_TEMPLATE_MISSING_DETAIL,
        };

    // The message is already out, so the audit event is always written. The
    // last result is stored only when the settings row is free; an Admin
    // saving the settings at that moment must not erase the audit trail.
    await this.deps.unitOfWork.run(async ({ settings, audit }) => {
      const at = this.deps.clock.now();
      await settings.recordTest({
        at,
        ok: sent.ok,
        error: sent.ok ? null : sent.detail,
      });
      await audit.append(
        auditEvent({
          occurredAt: at,
          actorType: "STAFF",
          actorId: actor.id,
          action: "whatsapp-test.sent",
          entityType: "WhatsAppSettings",
          entityId: "default",
          branchId: null,
          reason: null,
          changes: {
            templateId: template?.id ?? null,
            purpose: template?.purpose ?? null,
            ok: sent.ok,
            failure: sent.ok ? null : sent.code,
          },
        }),
      );
      return success(undefined);
    });

    if (sent.ok) return success({ providerMessageId: sent.providerMessageId });
    if (sent.code === "NOT_CONFIGURED" || sent.code === "TEMPLATE_MISSING") {
      return failure("WHATSAPP_NOT_CONFIGURED", sent.detail);
    }
    return failure("WHATSAPP_TEST_FAILED", sent.detail);
  }
}
