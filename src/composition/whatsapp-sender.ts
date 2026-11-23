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

function whatsAppTransportConfig() {
  const env = getServerEnv();
  if (env.WHATSAPP_PROVIDER === "fake") return { mode: "fake" } as const;
  if (!env.WHATSAPP_ACCESS_TOKEN) return { mode: "unconfigured" } as const;
  return {
    mode: "real",
    accessToken: env.WHATSAPP_ACCESS_TOKEN,
    graphVersion: env.WHATSAPP_GRAPH_VERSION,
  } as const;
}

export function whatsAppTransportReadiness() {
  return whatsAppTransportConfig().mode;
}

/**
 * The process wide transport. With `WHATSAPP_PROVIDER=fake` (development and
 * tests; refused in production) it is one in memory fake, so tests can read
 * what was sent. The access token is read here and goes only to Meta.
 */
export function whatsAppTransport(): WhatsAppTransport {
  if (transport) return transport;
  const config = whatsAppTransportConfig();
  if (config.mode === "fake") {
    transport = new FakeWhatsAppTransport();
  } else if (config.mode === "real") {
    transport = new MetaCloudWhatsAppTransport({
      accessToken: config.accessToken,
      graphVersion: config.graphVersion,
    });
  } else {
    transport = unconfiguredTransport;
  }
  return transport;
}

/** Use cases see only whether the token exists, never its value. */
function accessTokenConfigured(): boolean {
  return whatsAppTransportReadiness() !== "unconfigured";
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
