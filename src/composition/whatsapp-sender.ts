import "server-only";
import {
  TemplateWhatsAppSender,
  WhatsAppSetupReader,
  type WhatsAppTransport,
} from "@/application/notifications";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaWhatsAppSettingsRepository } from "@/infrastructure/db/prisma/repositories/reservations/notifications/whatsapp-settings-repository";
import { PrismaWhatsAppTemplateRepository } from "@/infrastructure/db/prisma/repositories/reservations/notifications/whatsapp-template-repository";
import { FakeWhatsAppTransport } from "@/infrastructure/whatsapp/fake-transport";
import { MetaCloudWhatsAppTransport } from "@/infrastructure/whatsapp/meta-cloud-transport";
import { getServerEnv } from "@/lib/env/server";

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
