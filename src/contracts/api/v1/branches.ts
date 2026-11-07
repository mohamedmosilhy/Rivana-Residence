import { z } from "zod";

// Branch and listing DTOs (docs/api/api-contracts.md, API-P1…P4 and
// API-A1…A3; spec 0002). Zod only (D-7).

const text = z.string().nullable();

export const Image = z
  .object({
    src: z.string(),
    alt: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .describe("A ready, rights-confirmed image served by /media.");

export const AccommodationType = z.enum(["ROOM", "APARTMENT"]);

export const BranchSummary = z.object({
  slug: z.string(),
  name: z.string(),
  summary: text,
  city: text,
  heroImage: Image.nullable(),
  onlineBookingEnabled: z.boolean(),
});

export const BranchDetail = BranchSummary.extend({
  phone: text,
  email: text,
  addressLine1: text,
  addressLine2: text,
  country: text,
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  checkInTime: text.describe("HH:MM in the branch time zone"),
  checkOutTime: text.describe("HH:MM in the branch time zone"),
  mapEmbedUrl: text.describe("A https://www.google.com/maps/embed… URL"),
});

export const BranchList = z.object({ items: z.array(BranchSummary) });

export const RoomTypeSummary = z.object({
  slug: z.string(),
  name: z.string(),
  accommodationType: AccommodationType,
  shortDescription: z.string(),
  maxAdults: z.number().int(),
  maxChildren: z.number().int(),
  bedroomCount: z.number().int().nullable(),
  bathroomCount: z.number().int().nullable(),
  heroImage: Image.nullable(),
  detailUrl: z.string().describe("/{branch}/stay/{slug}"),
});

export const RoomTypeDetail = RoomTypeSummary.extend({
  sizeSqm: z.number().nullable(),
  bedSummary: text,
  viewSummary: text,
  features: z.array(z.string()),
  gallery: z.array(Image),
});

export const RoomTypeList = z.object({ items: z.array(RoomTypeSummary) });

export const RoomTypeQuery = z
  .object({ type: AccommodationType.optional() })
  .strict();

export const StaffBranch = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  sortOrder: z.number().int(),
  onlineBookingEnabled: z.boolean(),
});

export const StaffBranchList = z.object({ items: z.array(StaffBranch) });

// Shapes only; the branch rules (reserved slugs, map allowlist, times,
// online booking) are checked by the use case and reported as fieldErrors.
const branchFields = {
  name: z.string(),
  summary: text.optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  phone: text.optional(),
  email: text.optional(),
  addressLine1: text.optional(),
  addressLine2: text.optional(),
  city: text.optional(),
  country: text.optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  mapEmbedUrl: text.optional(),
  checkInTime: text.optional(),
  checkOutTime: text.optional(),
  heroMediaId: text.optional(),
  onlineBookingEnabled: z.boolean().optional(),
  syncReminderIntervalMinutes: z.number().int().optional(),
  syncFollowUpMinutes: z.number().int().optional(),
  sortOrder: z.number().int().optional(),
};

export const BranchInput = z
  .object({ slug: z.string(), ...branchFields })
  .strict();

/** A partial `BranchInput` without `slug` (fixed once created). */
export const BranchPatch = z
  .object({ ...branchFields, name: z.string().optional() })
  .strict();

export type ImageDto = z.infer<typeof Image>;
export type BranchSummaryDto = z.infer<typeof BranchSummary>;
export type BranchDetailDto = z.infer<typeof BranchDetail>;
export type RoomTypeSummaryDto = z.infer<typeof RoomTypeSummary>;
export type RoomTypeDetailDto = z.infer<typeof RoomTypeDetail>;
export type StaffBranchDto = z.infer<typeof StaffBranch>;
