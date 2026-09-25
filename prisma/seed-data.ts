import { createId } from "@paralleldrive/cuid2";

import type { PrismaClient } from "../src/generated/prisma/client.ts";

const requiredPages = [
  { key: "HOME" as const, title: "Home", canonicalPath: "/" },
  { key: "ABOUT" as const, title: "About", canonicalPath: "/about" },
  { key: "CONTACT" as const, title: "Contact", canonicalPath: "/contact" },
];

// Creates only structural records. Staff accounts are provisioned with
// `npm run staff -- create`, which never takes a password from the environment.
export async function seedDatabase(client: PrismaClient) {
  await client.$transaction(async (transaction) => {
    await transaction.siteSettings.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        siteName: "Rivana Residence",
        timeZone: "Africa/Cairo",
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
        },
      });
    }
  });
}
