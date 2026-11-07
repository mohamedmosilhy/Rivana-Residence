// Staff roles (ADR 018). The database enum keeps its original name,
// `AdminRole`. Receptionists and Managers are branch scoped; Admins are
// implicitly all-branch; Editors are CMS-only with no branch scope (Q-01).
export const STAFF_ROLES = [
  "EDITOR",
  "ADMIN",
  "RECEPTIONIST",
  "MANAGER",
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

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
