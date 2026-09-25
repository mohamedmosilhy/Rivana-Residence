import type { PageDto } from "@/application/ports/repositories";
import { PAGE_SECTION_LABELS } from "@/domain/content/page-sections";
import { PublicationBadge } from "@/presentation/admin/ui/badge";
import { RichTextView } from "@/presentation/design/rich-text-view";

type Payload = Record<string, unknown>;
const str = (value: unknown) => (typeof value === "string" ? value : "");

function SectionBody({
  type,
  payload,
}: Readonly<{ type: PageDto["sections"][number]["type"]; payload: Payload }>) {
  const cta = payload.cta as { label?: string } | undefined;
  switch (type) {
    case "HERO":
      return (
        <>
          <p className="admin-preview__title">{str(payload.title)}</p>
          <p className="admin-preview__lede">{str(payload.summary)}</p>
          {cta?.label ? (
            <p className="admin-preview__cta">[{cta.label}]</p>
          ) : null}
        </>
      );
    case "RICH_TEXT":
      return <RichTextView document={payload.document} />;
    case "IMAGE_TEXT_SPLIT":
      return (
        <>
          <p className="admin-preview__media">
            Image on the {str(payload.imageSide) === "RIGHT" ? "right" : "left"}
          </p>
          <RichTextView document={payload.body} />
          {cta?.label ? (
            <p className="admin-preview__cta">[{cta.label}]</p>
          ) : null}
        </>
      );
    case "GALLERY":
      return <p className="admin-preview__media">Gallery images</p>;
    case "ROOM_GRID":
    case "FACILITY_GRID": {
      const noun = type === "ROOM_GRID" ? "rooms" : "facilities";
      return (
        <p className="admin-preview__media">
          Up to {String(payload.limit)} published{" "}
          {payload.featuredOnly ? `featured ${noun}` : noun}
        </p>
      );
    }
    case "CONTACT_CTA":
      return (
        <>
          <p>{str(payload.body)}</p>
          {payload.formEnabled ? (
            <p className="admin-preview__media">Enquiry form</p>
          ) : null}
        </>
      );
    case "FEATURE_GRID":
    case "STATS": {
      const items = Array.isArray(payload.items)
        ? (payload.items as Payload[])
        : [];
      return (
        <ul>
          {items.map((item, index) => (
            <li key={index}>
              <strong>{str(item.title ?? item.value)}</strong>{" "}
              {str(item.body ?? item.label)}
            </li>
          ))}
        </ul>
      );
    }
  }
}

// Visible sections only, in order, as a private read-through.
export function PagePreview({ page }: Readonly<{ page: PageDto }>) {
  const visible = page.sections.filter((section) => section.isVisible);
  return (
    <>
      <p className="admin-notice admin-notice--preview" role="note">
        Private preview.{" "}
        <PublicationBadge status={page.isPublished ? "PUBLISHED" : "DRAFT"} />{" "}
        Hidden sections are left out. The finished website design is applied
        later.
      </p>
      <article
        className="admin-preview"
        aria-label={`Preview of ${page.title}`}
      >
        {visible.map((section) => (
          <section
            key={section.id}
            className="admin-preview__section"
            aria-label={PAGE_SECTION_LABELS[section.type]}
          >
            {section.eyebrow ? (
              <p className="admin-preview__eyebrow">{section.eyebrow}</p>
            ) : null}
            {section.heading ? <h2>{section.heading}</h2> : null}
            <SectionBody
              type={section.type}
              payload={(section.payload ?? {}) as Payload}
            />
          </section>
        ))}
      </article>
    </>
  );
}
