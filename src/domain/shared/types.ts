export const ADMIN_ROLES = ["EDITOR", "ADMIN"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const PUBLICATION_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const MEDIA_STATUSES = [
  "PENDING",
  "READY",
  "FAILED",
  "DELETED",
] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const ENQUIRY_STATUSES = [
  "NEW",
  "READ",
  "ARCHIVED",
  "DELIVERY_FAILED",
] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export type RichTextDocument = Readonly<{
  type: "doc";
  content: readonly Readonly<Record<string, unknown>>[];
}>;
