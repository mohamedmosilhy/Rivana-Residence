import type {
  PublicationStatus,
  RichTextDocument,
} from "@/domain/shared/types";
import { PublicationBadge } from "@/presentation/admin/ui/badge";
import { RichTextView } from "@/presentation/design/rich-text-view";

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
      <p className="admin-notice admin-notice--preview" role="note">
        Private preview. <PublicationBadge status={status} /> Visitors cannot
        see this page, and the finished website design is applied later.
      </p>
      <article className="admin-preview" aria-label={`Preview of ${name}`}>
        <p className="admin-preview__media">
          {heroChosen
            ? `Hero image chosen${galleryCount ? ` · ${galleryCount} gallery image${galleryCount === 1 ? "" : "s"}` : ""}`
            : "No hero image yet"}
        </p>
        <h2 className="admin-preview__title">{name}</h2>
        <p className="admin-preview__lede">{shortDescription}</p>
        {facts.length > 0 ? (
          <ul className="admin-preview__facts">
            {facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        ) : null}
        <RichTextView document={description} className="admin-preview__body" />
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
