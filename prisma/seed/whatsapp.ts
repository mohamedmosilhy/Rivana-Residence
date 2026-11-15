import type { PrismaClient } from "../../src/generated/prisma/client.ts";

/** Required setup only; never reset the number or templates entered by staff. */
export async function seedWhatsAppSettings(client: PrismaClient) {
  await client.whatsAppSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}
