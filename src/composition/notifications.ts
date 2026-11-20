import "server-only";

import {
  ManageWhatsAppSettings,
  ManageWhatsAppTemplates,
  SendWhatsAppTestMessage,
  type WhatsAppSettingsContext,
  type WhatsAppTemplateContext,
  type WhatsAppTestContext,
} from "@/application/notifications";
import { WHATSAPP_TEST_RATE_LIMIT } from "@/application/shared/public-rate-limit-policy";
import { RateLimiter } from "@/application/shared/rate-limit";
import { throttleKeys } from "@/composition/auth";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaAuditLog } from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { PrismaWhatsAppSettingsRepository } from "@/infrastructure/db/prisma/repositories/reservations/notifications/whatsapp-settings-repository";
import { PrismaWhatsAppTemplateRepository } from "@/infrastructure/db/prisma/repositories/reservations/notifications/whatsapp-template-repository";
import { PrismaPublicRateLimitStore } from "@/infrastructure/db/prisma/repositories/public-rate-limit-store";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";

import { whatsAppSender, whatsAppSetupReader } from "./whatsapp-sender";
export {
  whatsAppSender,
  whatsAppSetupReader,
  whatsAppTransport,
} from "./whatsapp-sender";

const clock = { now: () => new Date() };

export function manageWhatsAppSettings() {
  return new ManageWhatsAppSettings({
    unitOfWork: new PrismaReservationUnitOfWork<WhatsAppSettingsContext>(
      getPrisma(),
      (transaction) => ({
        settings: new PrismaWhatsAppSettingsRepository(transaction),
        audit: new PrismaAuditLog(transaction),
      }),
    ),
    setup: whatsAppSetupReader(),
    clock,
  });
}

export function manageWhatsAppTemplates() {
  const client = getPrisma();
  return new ManageWhatsAppTemplates({
    unitOfWork: new PrismaReservationUnitOfWork<WhatsAppTemplateContext>(
      client,
      (transaction) => ({
        templates: new PrismaWhatsAppTemplateRepository(transaction),
        audit: new PrismaAuditLog(transaction),
      }),
    ),
    templates: new PrismaWhatsAppTemplateRepository(client),
    clock,
    ids: new Cuid2IdGenerator(),
  });
}

export function sendWhatsAppTestMessage() {
  const client = getPrisma();
  const limiter = new RateLimiter(
    new PrismaPublicRateLimitStore(client, clock),
    throttleKeys(),
  );
  return new SendWhatsAppTestMessage({
    unitOfWork: new PrismaReservationUnitOfWork<WhatsAppTestContext>(
      client,
      (transaction) => ({
        settings: new PrismaWhatsAppSettingsRepository(transaction),
        audit: new PrismaAuditLog(transaction),
      }),
    ),
    templates: new PrismaWhatsAppTemplateRepository(client),
    sender: whatsAppSender(),
    limiter: {
      // Keyed by the staff id (hashed by the throttle keys), not an address.
      consume: (staffId) =>
        limiter.consume(
          WHATSAPP_TEST_RATE_LIMIT.name,
          WHATSAPP_TEST_RATE_LIMIT.rule,
          staffId,
        ),
    },
    clock,
  });
}
