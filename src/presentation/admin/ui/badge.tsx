import type { EnquiryStatus, PublicationStatus } from "@/domain/shared/types";
import { BADGE_TONES } from "@/presentation/admin/ui/classes";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "brand";

export function Badge({
  tone = "neutral",
  children,
  className,
}: Readonly<{ tone?: BadgeTone; children: string; className?: string }>) {
  return (
    <span
      className={
        className ? `${BADGE_TONES[tone]} ${className}` : BADGE_TONES[tone]
      }
    >
      {children}
    </span>
  );
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
  className,
}: Readonly<{ status: PublicationStatus; className?: string }>) {
  const [label, tone] = PUBLICATION[status];
  return (
    <Badge tone={tone} {...(className ? { className } : {})}>
      {label}
    </Badge>
  );
}

export function EnquiryBadge({ status }: Readonly<{ status: EnquiryStatus }>) {
  const [label, tone] = ENQUIRY[status];
  return <Badge tone={tone}>{label}</Badge>;
}
