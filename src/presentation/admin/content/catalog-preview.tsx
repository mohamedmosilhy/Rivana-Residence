import type {
  PublicationStatus,
  RichTextDocument,
} from "@/domain/shared/types";
import { PublicationBadge } from "@/presentation/admin/ui/badge";
import { RichTextView } from "@/presentation/design/rich-text-view";
import {
  noticePreview,
  preview,
  previewFacts,
  previewLede,
  previewPlaceholder,
  previewTitle,
} from "@/presentation/admin/ui/classes";

type CatalogPreviewProps = Readonly<{
  status: PublicationStatus;
  name: string;
  shortDescription: string;
  description: RichTextDocument;
  facts: readonly string[];
  features?: readonly string[];
  heroChosen: boolean;
  galleryCount: number;
}>;

// A private, noindex read-through of the content as visitors will read it.
// The styled public template arrives with the public website (Phase 7).
export function CatalogPreview({
  status,
  name,
  shortDescription,
  description,
  facts,
  features = [],
  heroChosen,
  galleryCount,
}: CatalogPreviewProps) {
  return (
    <>
      <p className={noticePreview} role="note">
        Private preview. <PublicationBadge status={status} className="mx-1" />{" "}
        Visitors cannot see this page, and the finished website design is
        applied later.
      </p>
      <article className={preview} aria-label={`Preview of ${name}`}>
        <p className={previewPlaceholder}>
          {heroChosen
            ? `Hero image chosen${galleryCount ? ` · ${galleryCount} gallery image${galleryCount === 1 ? "" : "s"}` : ""}`
            : "No hero image yet"}
        </p>
        <h2 className={previewTitle}>{name}</h2>
        <p className={previewLede}>{shortDescription}</p>
        {facts.length > 0 ? (
          <ul className={previewFacts}>
            {facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        ) : null}
        <RichTextView document={description} />
        {features.length > 0 ? (
          <>
            <h3>Features</h3>
            <ul>
              {features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </>
        ) : null}
      </article>
    </>
  );
}
