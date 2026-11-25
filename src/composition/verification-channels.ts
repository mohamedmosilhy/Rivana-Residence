import "server-only";

import {
  ManageVerificationSettings,
  type VerificationChannelReadiness,
  type VerificationSettingsContext,
} from "@/application/guests";
import type { VerificationCodeEmail } from "@/application/notifications";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaAuditLog } from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { PrismaVerificationSettingsRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/verification-settings-repository";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import { createSmtpTransport } from "@/infrastructure/email/smtp-contact-delivery";
import {
  FakeVerificationCodeEmail,
  SmtpVerificationCodeEmail,
} from "@/infrastructure/email/verification-code-email";

import {
  reservationEmailConfig,
  reservationEmailReadiness,
} from "./reservation-email";
import { whatsAppSetupReader } from "./whatsapp-sender";

const emailDeliveryConfigured = () =>
  reservationEmailReadiness() !== "unconfigured";

/**
 * Which channels can deliver verification codes now (ADR 031). WhatsApp keeps
 * its Q-71 meaning. Email needs the email adapter configured (`fake` is
 * refused in production by the environment schema) and the Admin switch on
 * (Q-99).
 */
export function verificationChannelReadiness(
  client: DatabaseClient = getPrisma(),
): VerificationChannelReadiness {
  const whatsApp = whatsAppSetupReader();
  const settings = new PrismaVerificationSettingsRepository(client);
  return {
    isReady: async (channel) =>
      channel === "WHATSAPP"
        ? whatsApp.isConfigured()
        : emailDeliveryConfigured() &&
          (await settings.read())?.emailEnabled === true,
  };
}

/** API-A9 and the admin Guest verification page (Q-99). */
export function manageVerificationSettings(
  client: ReturnType<typeof getPrisma> = getPrisma(),
) {
  return new ManageVerificationSettings({
    unitOfWork: new PrismaReservationUnitOfWork<VerificationSettingsContext>(
      client,
      (transaction) => ({
        settings: new PrismaVerificationSettingsRepository(transaction),
        audit: new PrismaAuditLog(transaction),
      }),
    ),
    settings: new PrismaVerificationSettingsRepository(client),
    emailDelivery: { isConfigured: emailDeliveryConfigured },
    whatsApp: whatsAppSetupReader(),
    clock: { now: () => new Date() },
  });
}

let emailSender: VerificationCodeEmail | undefined;

/** The email code sender, on the same email adapter as reservation messages. */
export function verificationCodeEmail(): VerificationCodeEmail {
  if (emailSender) return emailSender;
  const config = reservationEmailConfig();
  switch (config.mode) {
    case "fake":
      emailSender = new FakeVerificationCodeEmail();
      break;
    case "real":
      emailSender = new SmtpVerificationCodeEmail(
        createSmtpTransport(config.smtp),
        config.from,
      );
      break;
    case "unconfigured":
      emailSender = {
        send: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      };
      break;
  }
  return emailSender;
}
