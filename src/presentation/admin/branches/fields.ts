// Shared by the client form and its Server Action, so it must not live in a
// "use client" module (server code would receive a client reference).
export const BRANCH_FORM_FIELDS = [
  "name",
  "slug",
  "summary",
  "status",
  "phone",
  "email",
  "addressLine1",
  "addressLine2",
  "city",
  "country",
  "latitude",
  "longitude",
  "checkInTime",
  "checkOutTime",
  "mapEmbedUrl",
  "sortOrder",
] as const;
export type BranchFormField = (typeof BRANCH_FORM_FIELDS)[number];
export type BranchFormValues = Readonly<
  Record<BranchFormField, string> & { heroMediaId: string | null }
>;
