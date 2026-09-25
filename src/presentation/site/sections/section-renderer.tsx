import type { ReactNode } from "react";

import type {
  PublicFacilityCard,
  PublicImage,
  PublicRoomCard,
  PublicSection,
} from "@/application/public/view-models";
import { RichTextView } from "@/presentation/design/rich-text-view";
import { CardGrid, FacilityCard, RoomCard } from "@/presentation/site/cards";
import { CtaLink } from "@/presentation/site/cta-link";
import { Gallery } from "@/presentation/site/gallery";
import { SiteImage } from "@/presentation/site/site-image";

type Payload = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value : "");

type SectionContext = Readonly<{
  rooms: readonly PublicRoomCard[];
  facilities: readonly PublicFacilityCard[];
  bookingMessage: string;
  /** The contact form, rendered where a Contact block enables it. */
  contactForm: ReactNode;
  /** The first hero is the page's LCP image and its only h1. */
  isFirst: boolean;
}>;

function SectionHeading({ section }: Readonly<{ section: PublicSection }>) {
  if (!section.heading && !section.eyebrow) return null;
  return (
    <header className="site-section__header">
      {section.eyebrow ? (
        <p className="site-eyebrow">{section.eyebrow}</p>
      ) : null}
      {section.heading ? <h2>{section.heading}</h2> : null}
    </header>
  );
}

function first(images: readonly PublicImage[] | undefined) {
  return images?.[0] ?? null;
}

function grid<T>(
  items: readonly (T & { featured: boolean })[],
  payload: Payload,
) {
  const limit = typeof payload.limit === "number" ? payload.limit : 3;
  return items
    .filter((item) => !payload.featuredOnly || item.featured)
    .slice(0, limit);
}

export function PageSection({
  section,
  context,
}: Readonly<{ section: PublicSection; context: SectionContext }>) {
  const payload = (section.payload ?? {}) as Payload;
  const id = `section-${section.id}`;

  switch (section.type) {
    case "HERO": {
      const background = first(section.images.BACKGROUND);
      const Title = context.isFirst ? "h1" : "h2";
      return (
        <section
          className={`site-hero${background ? " site-hero--image" : ""}`}
          aria-labelledby={id}
        >
          {background ? (
            <div className="site-hero__media">
              <SiteImage
                image={background}
                fill
                preload={context.isFirst}
                sizes="100vw"
              />
            </div>
          ) : null}
          <div className="site-hero__content site-container">
            {section.eyebrow ? (
              <p className="site-eyebrow">{section.eyebrow}</p>
            ) : null}
            <Title id={id} className="site-hero__title">
              {text(payload.title)}
            </Title>
            <p className="site-hero__summary">{text(payload.summary)}</p>
            <CtaLink
              cta={payload.cta}
              bookingMessage={context.bookingMessage}
            />
          </div>
        </section>
      );
    }
    case "RICH_TEXT": {
      const image = first(section.images.PRIMARY);
      return (
        <section
          className="site-section site-container"
          aria-labelledby={section.heading ? id : undefined}
        >
          {section.heading ? (
            <header className="site-section__header">
              {section.eyebrow ? (
                <p className="site-eyebrow">{section.eyebrow}</p>
              ) : null}
              <h2 id={id}>{section.heading}</h2>
            </header>
          ) : null}
          <div className="site-prose">
            <RichTextView document={payload.document} />
          </div>
          {image ? (
            <div className="site-section__image">
              <SiteImage image={image} sizes="(min-width: 64rem) 60vw, 100vw" />
            </div>
          ) : null}
        </section>
      );
    }
    case "IMAGE_TEXT_SPLIT": {
      const image = first(section.images.PRIMARY);
      return (
        <section
          className={`site-split site-container${payload.imageSide === "RIGHT" ? " site-split--reverse" : ""}`}
          aria-labelledby={section.heading ? id : undefined}
        >
          {image ? (
            <div className="site-split__media">
              <SiteImage
                image={image}
                fill
                sizes="(min-width: 64rem) 50vw, 100vw"
              />
            </div>
          ) : null}
          <div className="site-split__text">
            {section.eyebrow ? (
              <p className="site-eyebrow">{section.eyebrow}</p>
            ) : null}
            {section.heading ? <h2 id={id}>{section.heading}</h2> : null}
            <div className="site-prose">
              <RichTextView document={payload.body} />
            </div>
            <CtaLink
              cta={payload.cta}
              bookingMessage={context.bookingMessage}
            />
          </div>
        </section>
      );
    }
    case "GALLERY":
      return (
        <section className="site-section site-container">
          <SectionHeading section={section} />
          <Gallery
            images={section.images.GALLERY ?? []}
            label={section.heading ?? "Photo gallery"}
            layout={text(payload.layout)}
          />
        </section>
      );
    case "FEATURE_GRID":
    case "STATS": {
      const items = Array.isArray(payload.items)
        ? (payload.items as Payload[])
        : [];
      return (
        <section className="site-section site-container">
          <SectionHeading section={section} />
          {section.type === "STATS" ? (
            <dl className="site-stats">
              {items.map((item, index) => (
                <div key={index}>
                  <dt>{text(item.label)}</dt>
                  <dd>{text(item.value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <ul className="site-features">
              {items.map((item, index) => (
                <li key={index}>
                  <h3>{text(item.title)}</h3>
                  <p>{text(item.body)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      );
    }
    case "ROOM_GRID": {
      const rooms = grid(context.rooms, payload);
      if (rooms.length === 0) return null;
      return (
        <section className="site-section site-container">
          <SectionHeading section={section} />
          <CardGrid>
            {rooms.map((room) => (
              <RoomCard
                key={room.slug}
                room={room}
                headingLevel={section.heading ? 3 : 2}
              />
            ))}
          </CardGrid>
        </section>
      );
    }
    case "FACILITY_GRID": {
      const facilities = grid(context.facilities, payload);
      if (facilities.length === 0) return null;
      return (
        <section className="site-section site-container">
          <SectionHeading section={section} />
          <CardGrid>
            {facilities.map((facility) => (
              <FacilityCard
                key={facility.slug}
                facility={facility}
                headingLevel={section.heading ? 3 : 2}
              />
            ))}
          </CardGrid>
        </section>
      );
    }
    case "CONTACT_CTA": {
      const background = first(section.images.BACKGROUND);
      return (
        <section
          className="site-contact-cta"
          aria-labelledby={section.heading ? id : undefined}
        >
          {background ? (
            <div className="site-contact-cta__media">
              <SiteImage image={background} fill decorative sizes="100vw" />
            </div>
          ) : null}
          <div className="site-contact-cta__inner site-container">
            {section.eyebrow ? (
              <p className="site-eyebrow">{section.eyebrow}</p>
            ) : null}
            {section.heading ? <h2 id={id}>{section.heading}</h2> : null}
            <p>{text(payload.body)}</p>
            {payload.formEnabled ? context.contactForm : null}
          </div>
        </section>
      );
    }
  }
}

export function PageSections({
  sections,
  context,
  startIndex = 0,
}: Readonly<{
  sections: readonly PublicSection[];
  context: Omit<SectionContext, "isFirst">;
  /** Position of the first section on the page, when rendered in parts. */
  startIndex?: number;
}>) {
  return sections.map((section, index) => (
    <PageSection
      key={section.id}
      section={section}
      context={{ ...context, isFirst: startIndex + index === 0 }}
    />
  ));
}
