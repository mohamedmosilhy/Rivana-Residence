import type { PageKey } from "./page-sections";

// Kept free of path aliases (type imports only) so the Prisma seed can import
// it by relative path.

const paragraph = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

export type DefaultSection = Readonly<{
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

// The approved section sequence for each page (docs/domain/content-model.md). Copy
// is neutral draft text for staff to replace; pages stay unpublished until
// they do. Staff can edit, hide optional sections, and reorder, but never add
// or delete sections, so every page keeps its required structure.
export const defaultSections: Record<PageKey, readonly DefaultSection[]> = {
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

export const REQUIRED_PAGES = [
  { key: "HOME" as const, title: "Home", canonicalPath: "/" },
  { key: "ABOUT" as const, title: "About", canonicalPath: "/about" },
  { key: "CONTACT" as const, title: "Contact", canonicalPath: "/contact" },
];

/**
 * The draft sections a new page starts with. A new branch's Home hero is
 * titled with the branch name (spec 0002); everything else is the neutral
 * draft copy above.
 */
export function defaultPageSections(
  key: PageKey,
  branchName?: string,
): readonly DefaultSection[] {
  return defaultSections[key].map((section) =>
    section.type === "HERO" && key === "HOME" && branchName
      ? { ...section, payload: { ...section.payload, title: branchName } }
      : section,
  );
}
