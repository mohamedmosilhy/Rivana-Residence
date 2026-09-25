import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import type {
  PublicFacilityCard,
  PublicImage,
  PublicRoomCard,
  PublicSection,
  PublicSettings,
} from "@/application/public/view-models";
import { RichTextView } from "@/presentation/design/rich-text-view";
import { CardGrid, FacilityCard, RoomCard } from "@/presentation/site/cards";
import { CtaLink } from "@/presentation/site/cta-link";
import { Gallery } from "@/presentation/site/gallery";
import { Icon } from "@/presentation/site/icons";
import { BrushEdge, SunRays } from "@/presentation/site/ornaments";
import { SiteImage } from "@/presentation/site/site-image";

type Payload = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value : "");

type SectionContext = Readonly<{
  rooms: readonly PublicRoomCard[];
  facilities: readonly PublicFacilityCard[];
  bookingMessage: string;
  /** The contact form, rendered where a Contact block enables it. */
  contactForm: ReactNode;
  /** Phone and email shown beside a Contact block; null to omit them. */
  contactDetails: PublicSettings | null;
  /** The home hero fills the screen; other page heroes are shorter. */
  heroSize: "full" | "page";
  /** The first hero is the page's LCP image and its only h1. */
  isFirst: boolean;
}>;

function SectionHeading({
  section,
  id,
  link,
}: Readonly<{
  section: PublicSection;
  id?: string | undefined;
  link?: Readonly<{ href: Route; label: string }>;
}>) {
  if (!section.heading && !section.eyebrow) return null;
  return (
    <header className="site-section__header">
      <div>
        {section.eyebrow ? (
          <p className="site-eyebrow">{section.eyebrow}</p>
        ) : null}
        {section.heading ? <h2 id={id}>{section.heading}</h2> : null}
      </div>
      {link ? (
        <Link href={link.href} className="site-link">
          {link.label}
          <Icon name="arrow" />
        </Link>
      ) : null}
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
  const labelledBy = section.heading ? id : undefined;

  switch (section.type) {
    case "HERO": {
      const background = first(section.images.BACKGROUND);
      const Title = context.isFirst ? "h1" : "h2";
      return (
        <section
          className={`site-hero site-hero--${context.heroSize}${background ? " site-hero--image" : ""}`}
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
          ) : (
            <SunRays className="site-page-hero__rays" />
          )}
          <div className="site-hero__content site-container">
            {section.eyebrow ? (
              <p className="site-eyebrow">{section.eyebrow}</p>
            ) : null}
            <Title id={id} className="site-hero__title">
              {text(payload.title)}
            </Title>
            <p className="site-hero__summary">{text(payload.summary)}</p>
            <div className="site-actions">
              <CtaLink
                cta={payload.cta}
                bookingMessage={context.bookingMessage}
              />
            </div>
          </div>
          {context.heroSize === "full" ? (
            <span className="site-hero__scroll" aria-hidden="true">
              Scroll
            </span>
          ) : null}
          <BrushEdge className="site-edge" />
        </section>
      );
    }
    case "RICH_TEXT": {
      const image = first(section.images.PRIMARY);
      return (
        <section
          className="site-section site-intro site-container"
          aria-labelledby={labelledBy}
        >
          <SectionHeading section={section} id={labelledBy} />
          <div className="site-intro__body">
            <RichTextView
              document={payload.document}
              className="site-prose site-prose--lead"
            />
            {image ? (
              <div className="site-intro__image">
                <SiteImage
                  image={image}
                  sizes="(min-width: 64rem) 55vw, 100vw"
                />
              </div>
            ) : null}
          </div>
        </section>
      );
    }
    case "IMAGE_TEXT_SPLIT": {
      const image = first(section.images.PRIMARY);
      return (
        <section
          className={`site-split site-container${payload.imageSide === "RIGHT" ? " site-split--reverse" : ""}${image ? "" : " site-split--text"}`}
          aria-labelledby={labelledBy}
        >
          {image ? (
            <div
              className={`site-split__media${image.height > image.width ? " site-split__media--portrait" : ""}`}
            >
              <div className="site-split__frame">
                <SiteImage
                  image={image}
                  fill
                  sizes="(min-width: 64rem) 45vw, 100vw"
                />
              </div>
            </div>
          ) : null}
          <div className="site-split__text">
            {section.eyebrow ? (
              <p className="site-eyebrow">{section.eyebrow}</p>
            ) : null}
            {section.heading ? <h2 id={id}>{section.heading}</h2> : null}
            <RichTextView document={payload.body} className="site-prose" />
            <div className="site-actions">
              <CtaLink
                cta={payload.cta}
                bookingMessage={context.bookingMessage}
              />
            </div>
          </div>
        </section>
      );
    }
    case "GALLERY":
      return (
        <section
          className="site-section site-container"
          aria-labelledby={labelledBy}
        >
          <SectionHeading section={section} id={labelledBy} />
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
        <section
          className={`site-section site-container site-${section.type === "STATS" ? "stats" : "features"}-section`}
          aria-labelledby={labelledBy}
        >
          <SectionHeading section={section} id={labelledBy} />
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
                  <span className="site-features__index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
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
        <section
          className="site-section site-container"
          aria-labelledby={labelledBy}
        >
          <SectionHeading
            section={section}
            id={labelledBy}
            link={{ href: "/rooms", label: "View all rooms" }}
          />
          <CardGrid>
            {rooms.map((room, index) => (
              <RoomCard
                key={room.slug}
                room={room}
                index={index}
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
        <section className="site-band" aria-labelledby={labelledBy}>
          <div className="site-section site-container">
            <SectionHeading
              section={section}
              id={labelledBy}
              link={{ href: "/facilities", label: "View all amenities" }}
            />
            <CardGrid variant="tiles">
              {facilities.map((facility) => (
                <FacilityCard
                  key={facility.slug}
                  facility={facility}
                  headingLevel={section.heading ? 3 : 2}
                />
              ))}
            </CardGrid>
          </div>
        </section>
      );
    }
    case "CONTACT_CTA": {
      const background = first(section.images.BACKGROUND);
      const details = context.contactDetails;
      const form = payload.formEnabled ? context.contactForm : null;
      return (
        <section
          className={`site-contact-cta${form ? " site-contact-cta--form" : ""}`}
          aria-labelledby={labelledBy}
        >
          {background ? (
            <div className="site-contact-cta__media">
              <SiteImage image={background} fill decorative sizes="100vw" />
            </div>
          ) : null}
          <div className="site-contact-cta__inner site-container">
            <div className="site-contact-cta__intro">
              {section.eyebrow ? (
                <p className="site-eyebrow">{section.eyebrow}</p>
              ) : null}
              {section.heading ? <h2 id={id}>{section.heading}</h2> : null}
              <p className="site-contact-cta__body">{text(payload.body)}</p>
              {details && (details.phone || details.email) ? (
                <address className="site-contact-cta__details">
                  {details.phone ? (
                    <a href={`tel:${details.phone.replace(/[^+0-9]/g, "")}`}>
                      <Icon name="phone" />
                      {details.phone}
                    </a>
                  ) : null}
                  {details.email ? (
                    <a href={`mailto:${details.email}`}>
                      <Icon name="mail" />
                      {details.email}
                    </a>
                  ) : null}
                </address>
              ) : null}
              {form ? null : (
                <div className="site-actions">
                  <Link href="/contact" className="site-button">
                    Get in touch
                  </Link>
                </div>
              )}
            </div>
            {form ? <div className="site-contact-cta__form">{form}</div> : null}
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
