import { createId } from "@paralleldrive/cuid2";

import type { Prisma, PrismaClient } from "../src/generated/prisma/client.ts";

const paragraph = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

type SeedSection = Readonly<{
  type:
    | "HERO"
    | "RICH_TEXT"
    | "IMAGE_TEXT_SPLIT"
    | "GALLERY"
    | "FEATURE_GRID"
    | "ROOM_GRID"
    | "FACILITY_GRID"
    | "CONTACT_CTA"
    | "STATS";
  heading?: string;
  eyebrow?: string;
  isVisible: boolean;
  payload: Record<string, unknown>;
}>;

// The approved section sequence for each page (docs/content-model.md). Copy
// is neutral draft text for staff to replace; pages stay unpublished until
// they do. Staff can edit, hide optional sections, and reorder, but never add
// or delete sections, so every page keeps its required structure.
export const defaultSections: Record<
  "HOME" | "ABOUT" | "CONTACT",
  SeedSection[]
> = {
  HOME: [
    {
      type: "HERO",
      isVisible: true,
      payload: {
        schemaVersion: 1,
        title: "Rivana Residence",
        summary: "Draft introduction. Replace before publishing.",
      },
    },
    {
      type: "RICH_TEXT",
      heading: "Welcome",
      isVisible: true,
      payload: {
        schemaVersion: 1,
        document: paragraph("Draft welcome text. Replace before publishing."),
      },
    },
    {
      type: "ROOM_GRID",
      heading: "Rooms",
      isVisible: true,
      payload: { schemaVersion: 1, limit: 3, featuredOnly: true },
    },
    {
      type: "FACILITY_GRID",
      heading: "Facilities",
      isVisible: true,
      payload: { schemaVersion: 1, limit: 3, featuredOnly: true },
    },
    {
      type: "IMAGE_TEXT_SPLIT",
      heading: "Lifestyle",
      isVisible: false,
      payload: {
        schemaVersion: 1,
        body: paragraph("Draft lifestyle text. Replace before publishing."),
        imageSide: "RIGHT",
      },
    },
    {
      type: "CONTACT_CTA",
      heading: "Contact us",
      isVisible: true,
      payload: {
        schemaVersion: 1,
        body: "Draft contact invitation. Replace before publishing.",
        formEnabled: false,
      },
    },
  ],
  ABOUT: [
    {
      type: "HERO",
      isVisible: true,
      payload: {
        schemaVersion: 1,
        title: "About Rivana",
        summary: "Draft introduction. Replace before publishing.",
      },
    },
    {
      type: "IMAGE_TEXT_SPLIT",
      heading: "Our story",
      isVisible: true,
      payload: {
        schemaVersion: 1,
        body: paragraph("Draft story text. Replace before publishing."),
        imageSide: "LEFT",
      },
    },
    {
      type: "STATS",
      heading: "At a glance",
      isVisible: false,
      payload: {
        schemaVersion: 1,
        items: [{ value: "0", label: "Draft figure. Replace before showing." }],
      },
    },
    {
      type: "GALLERY",
      heading: "Gallery",
      isVisible: false,
      payload: { schemaVersion: 1, layout: "EDITORIAL" },
    },
    {
      type: "ROOM_GRID",
      heading: "Rooms",
      isVisible: false,
      payload: { schemaVersion: 1, limit: 3, featuredOnly: true },
    },
    {
      type: "CONTACT_CTA",
      heading: "Contact us",
      isVisible: true,
      payload: {
        schemaVersion: 1,
        body: "Draft contact invitation. Replace before publishing.",
        formEnabled: false,
      },
    },
  ],
  CONTACT: [
    {
      type: "HERO",
      isVisible: true,
      payload: {
        schemaVersion: 1,
        title: "Contact",
        summary: "Draft introduction. Replace before publishing.",
      },
    },
    {
      type: "RICH_TEXT",
      heading: "Getting here",
      isVisible: false,
      payload: {
        schemaVersion: 1,
        document: paragraph("Draft directions. Replace before publishing."),
      },
    },
    {
      type: "CONTACT_CTA",
      heading: "Send an enquiry",
      isVisible: true,
      payload: {
        schemaVersion: 1,
        body: "Draft enquiry invitation. Replace before publishing.",
        formEnabled: true,
      },
    },
  ],
};

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
      const row = await transaction.page.upsert({
        where: { key: page.key },
        update: {},
        create: {
          id: createId(),
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
  });
}
