import "server-only";

import {
  ManageWhatsAppSettings,
  ManageWhatsAppTemplates,
  SendWhatsAppTestMessage,
  TemplateWhatsAppSender,
  WhatsAppSetupReader,
  type WhatsAppSettingsContext,
  type WhatsAppTemplateContext,
  type WhatsAppTestContext,
  type WhatsAppTransport,
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
import { FakeWhatsAppTransport } from "@/infrastructure/whatsapp/fake-transport";
import { MetaCloudWhatsAppTransport } from "@/infrastructure/whatsapp/meta-cloud-transport";
import { getServerEnv } from "@/lib/env/server";

const clock = { now: () => new Date() };

/** Without a token nothing is sent; this transport is never reached then. */
const unconfiguredTransport: WhatsAppTransport = {
  async deliver() {
    return {
      ok: false,
      code: "UNAVAILABLE",
      detail: "The WhatsApp access token is not configured.",
    };
  },
};

let transport: WhatsAppTransport | undefined;

/**
 * The process wide transport. With `WHATSAPP_PROVIDER=fake` (development and
 * tests; refused in production) it is one in memory fake, so tests can read
 * what was sent. The access token is read here and goes only to Meta.
 */
export function whatsAppTransport(): WhatsAppTransport {
  if (transport) return transport;
  const env = getServerEnv();
  if (env.WHATSAPP_PROVIDER === "fake") {
    transport = new FakeWhatsAppTransport();
  } else if (env.WHATSAPP_ACCESS_TOKEN) {
    transport = new MetaCloudWhatsAppTransport({
      accessToken: env.WHATSAPP_ACCESS_TOKEN,
      graphVersion: env.WHATSAPP_GRAPH_VERSION,
    });
  } else {
    transport = unconfiguredTransport;
  }
  return transport;
}

/** Use cases see only whether the token exists, never its value. */
function accessTokenConfigured(): boolean {
  const env = getServerEnv();
  return env.WHATSAPP_PROVIDER === "fake" || Boolean(env.WHATSAPP_ACCESS_TOKEN);
}

export function whatsAppSetupReader() {
  const client = getPrisma();
  return new WhatsAppSetupReader({
    settings: new PrismaWhatsAppSettingsRepository(client),
    templates: new PrismaWhatsAppTemplateRepository(client),
    accessTokenConfigured: accessTokenConfigured(),
  });
}

/** The sender later tasks use (verification codes, the outbox dispatcher). */
export function whatsAppSender() {
  const client = getPrisma();
  return new TemplateWhatsAppSender({
    settings: new PrismaWhatsAppSettingsRepository(client),
    templates: new PrismaWhatsAppTemplateRepository(client),
    transport: whatsAppTransport(),
    accessTokenConfigured: accessTokenConfigured(),
  });
}

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
