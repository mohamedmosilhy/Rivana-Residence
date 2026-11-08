import { createId } from "@paralleldrive/cuid2";

import type { Prisma, PrismaClient } from "../src/generated/prisma/client.ts";

import {
  DEFAULT_BRANCH_ID,
  DEFAULT_BRANCH_SLUG,
} from "../src/domain/branches/default-branch.ts";
import {
  REQUIRED_PAGES,
  defaultSections,
} from "../src/domain/content/default-sections.ts";

// The first branch. The branches migration inserts it with this id (SQL
// cannot generate CUID2), and the seed upserts the same row so a fresh or
// truncated database always has it (spec 0001).
export { DEFAULT_BRANCH_ID, DEFAULT_BRANCH_SLUG, defaultSections };

// Creates only structural records: settings, the default branch, and the three
// pages. The first administrator, the branch details, and the content are
// separate steps of the one seed (prisma/seed/index.ts). Other staff accounts
// are provisioned with `npm run staff -- create`. Returns the default branch id.
export async function seedDatabase(client: PrismaClient) {
  return client.$transaction(async (transaction) => {
    const settings = await transaction.siteSettings.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        siteName: "Rivana Residence",
        timeZone: "Africa/Cairo",
      },
    });

    // Same values the migration copies from SiteSettings; never overwrites
    // an existing branch.
    const branch = await transaction.branch.upsert({
      where: { slug: DEFAULT_BRANCH_SLUG },
      update: {},
      create: {
        id: DEFAULT_BRANCH_ID,
        slug: DEFAULT_BRANCH_SLUG,
        name: settings.siteName,
        summary: settings.tagline?.slice(0, 300) ?? null,
        timeZone: settings.timeZone,
        phone: settings.phone,
        email: settings.email,
        addressLine1: settings.addressLine1,
        addressLine2: settings.addressLine2,
        city: settings.city,
        country: settings.country,
        latitude: settings.latitude,
        longitude: settings.longitude,
        mapEmbedUrl: settings.mapEmbedUrl,
        sortOrder: 0,
      },
    });

    for (const page of REQUIRED_PAGES) {
      const row = await transaction.page.upsert({
        where: { branchId_key: { branchId: branch.id, key: page.key } },
        update: {},
        create: {
          id: createId(),
          branchId: branch.id,
          key: page.key,
          title: page.title,
          canonicalPath: page.canonicalPath,
          isPublished: false,
        },
        include: { _count: { select: { sections: true } } },
      });
      // Only a page with no sections gets the defaults, so re-seeding never
      // overwrites staff edits.
      if (row._count.sections === 0) {
        await transaction.pageSection.createMany({
          data: defaultSections[page.key].map((section, index) => ({
            id: createId(),
            pageId: row.id,
            type: section.type,
            heading: section.heading ?? null,
            eyebrow: section.eyebrow ?? null,
            isVisible: section.isVisible,
            payload: section.payload as Prisma.InputJsonObject,
            sortOrder: index,
          })),
        });
      }
    }
    return branch.id;
  });
}
