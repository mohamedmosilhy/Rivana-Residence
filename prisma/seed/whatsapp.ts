import type { PrismaClient } from "../../src/generated/prisma/client.ts";

/** Required setup only; never reset the number or templates entered by staff. */
export async function seedWhatsAppSettings(client: PrismaClient) {
  await client.whatsAppSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}

/**
 * The Admin switch for verification codes by email (Q-99). The migration
 * creates it off; this only restores a missing row and never changes an
 * Admin's choice.
 */
export async function seedVerificationSettings(client: PrismaClient) {
  await client.verificationSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}
