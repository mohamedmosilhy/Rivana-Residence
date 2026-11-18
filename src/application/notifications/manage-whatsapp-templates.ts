import type { AuditLog } from "@/application/audit";
import { authorize } from "@/application/auth/authorize";
import type { StaffPrincipal } from "@/application/auth/ports";
import type { ReservationUnitOfWork } from "@/application/reservations";
import type { Clock, IdGenerator } from "@/application/shared/providers";
import {
  failure,
  invalid,
  success,
  type Result,
} from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import {
  parseWhatsAppTemplateInput,
  parseWhatsAppTemplatePatch,
  type WhatsAppTemplateInput,
} from "@/domain/notifications";

import type {
  WhatsAppTemplateRecord,
  WhatsAppTemplateRepository,
} from "./ports";

export type WhatsAppTemplateContext = Readonly<{
  templates: WhatsAppTemplateRepository;
  audit: AuditLog;
}>;

const NOT_FOUND = "This template was not found.";
export const ACTIVE_TEMPLATE_TAKEN =
  "Another template is already active for this purpose and language. Deactivate it first.";

function snapshot(template: WhatsAppTemplateInput) {
  return {
    purpose: template.purpose,
    language: template.language,
    providerName: template.providerName,
    category: template.category,
    variables: [...template.variables],
    active: template.active,
  };
}

function inputOf(template: WhatsAppTemplateRecord): WhatsAppTemplateInput {
  return {
    purpose: template.purpose,
    language: template.language,
    providerName: template.providerName,
    category: template.category,
    variables: template.variables,
    previewText: template.previewText,
    active: template.active,
  };
}

/** The unique index guards one active template per purpose and language. */
function activeTaken<T>(result: Result<T>): Result<T> {
  if (!result.ok && result.error.code === "CONFLICT") {
    return failure("CONFLICT", ACTIVE_TEMPLATE_TAKEN, {
      active: [ACTIVE_TEMPLATE_TAKEN],
    });
  }
  return result;
}

/**
 * WhatsApp templates (API-A7, Q-67). Admin only. Variable keys come from the
 * per purpose allowlist; one template is active per purpose and language
 * (except marketing); a template is deactivated, never deleted.
 */
export class ManageWhatsAppTemplates {
  constructor(
    private readonly deps: Readonly<{
      unitOfWork: ReservationUnitOfWork<WhatsAppTemplateContext>;
      templates: WhatsAppTemplateRepository;
      clock: Clock;
      ids: IdGenerator;
    }>,
  ) {}

  async list(
    staff: StaffPrincipal | null,
  ): Promise<Result<readonly WhatsAppTemplateRecord[]>> {
    const access = authorize(staff, "settings:edit");
    if (!access.ok) return access;
    return success(await this.deps.templates.list());
  }

  async create(
    staff: StaffPrincipal | null,
    input: unknown,
  ): Promise<Result<WhatsAppTemplateRecord>> {
    const access = authorize(staff, "settings:edit");
    if (!access.ok) return access;
    const parsed = parseWhatsAppTemplateInput(input);
    if (!parsed.ok)
      return invalid("The template needs attention.", parsed.issues);
    const actor = access.value;

    return this.deps.unitOfWork.run(async ({ templates, audit }) => {
      const created = activeTaken(
        await templates.create(
          this.deps.ids.next(),
          parsed.value,
          actor.id,
          this.deps.clock.now(),
        ),
      );
      if (!created.ok) return created;
      await audit.append(
        auditEvent({
          occurredAt: created.value.updatedAt,
          actorType: "STAFF",
          actorId: actor.id,
          action: "whatsapp-template.created",
          entityType: "WhatsAppTemplate",
          entityId: created.value.id,
          branchId: null,
          reason: null,
          changes: {
            before: null,
            after: snapshot(created.value),
            previewChanged: true,
          },
        }),
      );
      return created;
    });
  }

  /** Merges the patch onto the template under its row lock, then validates. */
  async update(
    staff: StaffPrincipal | null,
    id: string,
    input: unknown,
  ): Promise<Result<WhatsAppTemplateRecord>> {
    const access = authorize(staff, "settings:edit");
    if (!access.ok) return access;
    if (!id || id.length > 32) return failure("NOT_FOUND", NOT_FOUND);
    const patch = parseWhatsAppTemplatePatch(input);
    if (!patch.ok)
      return invalid("The template needs attention.", patch.issues);
    const actor = access.value;

    return this.deps.unitOfWork.run(async ({ templates, audit }) => {
      const locked = await templates.lock(id);
      if (!locked.ok) return locked;
      const before = locked.value;
      if (!before) return failure("NOT_FOUND", NOT_FOUND);
      const merged = parseWhatsAppTemplateInput({
        ...inputOf(before),
        variables: [...before.variables],
        ...patch.value,
      });
      if (!merged.ok) {
        return invalid("The template needs attention.", merged.issues);
      }
      if (JSON.stringify(inputOf(before)) === JSON.stringify(merged.value)) {
        return success(before);
      }
      const after = activeTaken(
        await templates.replace(
          id,
          merged.value,
          actor.id,
          this.deps.clock.now(),
        ),
      );
      if (!after.ok) return after;
      await audit.append(
        auditEvent({
          occurredAt: after.value.updatedAt,
          actorType: "STAFF",
          actorId: actor.id,
          action: "whatsapp-template.updated",
          entityType: "WhatsAppTemplate",
          entityId: id,
          branchId: null,
          reason: null,
          changes: {
            before: snapshot(before),
            after: snapshot(after.value),
            previewChanged: before.previewText !== after.value.previewText,
          },
        }),
      );
      return after;
    });
  }
}
