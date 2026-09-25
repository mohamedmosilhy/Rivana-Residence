import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";

import type { PrismaClient } from "../src/generated/prisma/client.ts";

const seedEnvironmentSchema = z
  .object({
    SEED_ADMIN_EMAIL: z.email().max(320).optional(),
    SEED_ADMIN_NAME: z.string().trim().min(1).max(120).optional(),
  })
  .superRefine((environment, context) => {
    if (environment.SEED_ADMIN_EMAIL && !environment.SEED_ADMIN_NAME) {
      context.addIssue({
        code: "custom",
        path: ["SEED_ADMIN_NAME"],
        message: "SEED_ADMIN_NAME is required when SEED_ADMIN_EMAIL is set.",
      });
    }
  });

const requiredPages = [
  { key: "HOME" as const, title: "Home", canonicalPath: "/" },
  { key: "ABOUT" as const, title: "About", canonicalPath: "/about" },
  { key: "CONTACT" as const, title: "Contact", canonicalPath: "/contact" },
];

export async function seedDatabase(
  client: PrismaClient,
  input: Record<string, string | undefined>,
) {
  const environment = seedEnvironmentSchema.parse({
    SEED_ADMIN_EMAIL: input.SEED_ADMIN_EMAIL || undefined,
    SEED_ADMIN_NAME: input.SEED_ADMIN_NAME || undefined,
  });

  await client.$transaction(async (transaction) => {
    let adminId: string | null = null;
    if (environment.SEED_ADMIN_EMAIL && environment.SEED_ADMIN_NAME) {
      const admin = await transaction.user.upsert({
        where: { email: environment.SEED_ADMIN_EMAIL.toLowerCase() },
        update: {
          name: environment.SEED_ADMIN_NAME,
          role: "ADMIN",
          active: true,
        },
        create: {
          id: createId(),
          email: environment.SEED_ADMIN_EMAIL.toLowerCase(),
          name: environment.SEED_ADMIN_NAME,
          role: "ADMIN",
          active: true,
        },
      });
      adminId = admin.id;
    }

    await transaction.siteSettings.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        siteName: "Rivana Residence",
        timeZone: "Africa/Cairo",
        updatedById: adminId,
      },
    });

    for (const page of requiredPages) {
      await transaction.page.upsert({
        where: { key: page.key },
        update: {},
        create: {
          id: createId(),
          key: page.key,
          title: page.title,
          canonicalPath: page.canonicalPath,
          isPublished: false,
          updatedById: adminId,
        },
      });
    }
  });
}
