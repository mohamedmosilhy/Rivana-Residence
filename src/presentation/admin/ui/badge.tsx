import type { EnquiryStatus, PublicationStatus } from "@/domain/shared/types";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "brand";

export function Badge({
  tone = "neutral",
  children,
}: Readonly<{ tone?: BadgeTone; children: string }>) {
  return <span className={`admin-badge admin-badge--${tone}`}>{children}</span>;
}

const PUBLICATION: Record<PublicationStatus, [string, BadgeTone]> = {
  DRAFT: ["Draft", "warning"],
  PUBLISHED: ["Published", "success"],
  ARCHIVED: ["Archived", "neutral"],
};

const ENQUIRY: Record<EnquiryStatus, [string, BadgeTone]> = {
  NEW: ["New", "brand"],
  READ: ["Read", "neutral"],
  ARCHIVED: ["Archived", "neutral"],
  DELIVERY_FAILED: ["Delivery failed", "danger"],
};

export const ENQUIRY_STATUS_LABELS = Object.fromEntries(
  Object.entries(ENQUIRY).map(([status, [label]]) => [status, label]),
) as Record<EnquiryStatus, string>;

// Status is always conveyed by text; colour only reinforces it.
export function PublicationBadge({
  status,
}: Readonly<{ status: PublicationStatus }>) {
  const [label, tone] = PUBLICATION[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function EnquiryBadge({ status }: Readonly<{ status: EnquiryStatus }>) {
  const [label, tone] = ENQUIRY[status];
  return <Badge tone={tone}>{label}</Badge>;
}
