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
import { CountUp } from "@/presentation/site/motion/count-up";
import {
  ParallaxLayer,
  ScrollFade,
} from "@/presentation/site/motion/hero-scroll";
import {
  Reveal,
  RevealImage,
  RevealItem,
} from "@/presentation/site/motion/reveal";
import { SplitTitle } from "@/presentation/site/motion/split-title";
import { BrushEdge, SunRays } from "@/presentation/site/ornaments";
import { SiteImage } from "@/presentation/site/site-image";
import {
  actionFill,
  actions,
  brushEdge,
  button,
  container,
  eyebrow,
  eyebrowDark,
  goldFrame,
  heroRays,
  lightSection,
  link as linkClass,
  linkIcon,
  linkInverse,
  proseInSection,
  proseLead,
  sectionHeader,
  sectionHeaderFlush,
  sectionHeading,
  sectionHeadingOnPlum,
} from "@/presentation/site/classes";

type Payload = Record<string, unknown>;

// A soft scrim keeps text legible over the hero photograph.
const HERO_SCRIM =
  "after:absolute after:inset-0 after:-z-1 after:bg-[linear-gradient(to_bottom,rgb(26_11_20/0.35)_0%,rgb(26_11_20/0.05)_30%,rgb(26_11_20/0.3)_58%,rgb(26_11_20/0.86)_100%),linear-gradient(to_right,rgb(26_11_20/0.5),transparent_65%)] after:content-['']";
const RISE = "animate-[site-rise_900ms_var(--ease-out-soft)_both]";
const CONTACT_LINK =
  "inline-flex min-h-11 min-w-0 items-center gap-4 text-[1.0625rem] text-surface [overflow-wrap:anywhere] hover:underline hover:underline-offset-[0.3em]";
const CONTACT_ICON = "size-5 flex-none text-gold-400";
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
  onPlum = false,
  flush = false,
}: Readonly<{
  section: PublicSection;
  id?: string | undefined;
  link?: Readonly<{ href: Route; label: string }>;
  /** On the plum band: white heading, gold eyebrow, white link. */
  onPlum?: boolean;
  /** Beside an introduction: no space below. */
  flush?: boolean;
}>) {
  if (!section.heading && !section.eyebrow) return null;
  return (
    <Reveal as="header" className={flush ? sectionHeaderFlush : sectionHeader}>
      <div>
        {section.eyebrow ? (
          <p className={onPlum ? eyebrowDark : eyebrow}>{section.eyebrow}</p>
        ) : null}
        {section.heading ? (
          <h2
            id={id}
            className={onPlum ? sectionHeadingOnPlum : sectionHeading}
          >
            {section.heading}
          </h2>
        ) : null}
      </div>
      {link ? (
        <Link href={link.href} className={onPlum ? linkInverse : linkClass}>
          {link.label}
          <Icon name="arrow" className={linkIcon} />
        </Link>
      ) : null}
    </Reveal>
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
      const title = text(payload.title);
      // The one per-character reveal: the opening of the home page.
      const signature = context.isFirst && context.heroSize === "full";
      const opening = context.isFirst;
      return (
        <section
          data-dark-surface=""
          className={`relative isolate grid items-end overflow-hidden bg-plum-900 bg-[radial-gradient(ellipse_at_80%_15%,rgb(101_42_76/0.9),transparent_60%)] text-surface ${
            context.heroSize === "full"
              ? "min-h-[clamp(38rem,100svh,62rem)]"
              : "min-h-[clamp(30rem,72svh,46rem)]"
          } ${background ? HERO_SCRIM : ""}`}
          aria-labelledby={id}
        >
          {background ? (
            <div className="absolute inset-0 -z-2">
              <ParallaxLayer className="absolute inset-0">
                <SiteImage
                  image={background}
                  fill
                  preload={context.isFirst}
                  sizes="100vw"
                  {...(context.isFirst
                    ? {
                        className:
                          "animate-[site-settle_2.4s_var(--ease-out-soft)_both]",
                      }
                    : {})}
                />
              </ParallaxLayer>
            </div>
          ) : (
            <SunRays className={heroRays} motion="draw" />
          )}
          <ScrollFade
            className={`${container} grid justify-items-start pt-[calc(var(--header-height)+3rem)] pb-[clamp(5rem,11vw,9rem)]`}
          >
            {section.eyebrow ? (
              <p className={`${eyebrowDark} ${opening ? RISE : ""}`}>
                {section.eyebrow}
              </p>
            ) : null}
            <Title
              id={id}
              className={`m-0 max-w-[14ch] font-display font-normal text-balance ${
                context.heroSize === "full"
                  ? "text-display-xl leading-[0.98] tracking-[-0.015em]"
                  : "text-display-lg leading-[1.02] tracking-[-0.015em]"
              } ${opening && !signature ? `${RISE} [animation-delay:120ms]` : ""}`}
            >
              {signature ? <SplitTitle text={title} /> : title}
            </Title>
            <p
              className={`mt-6 mb-0 max-w-[34rem] text-body-lg leading-[1.6] text-inverse-strong empty:hidden ${
                opening
                  ? `${RISE} ${signature ? "[animation-delay:900ms]" : "[animation-delay:260ms]"}`
                  : ""
              }`}
            >
              {text(payload.summary)}
            </p>
            <div
              className={`${actions} ${
                opening
                  ? `${RISE} ${signature ? "[animation-delay:1050ms]" : "[animation-delay:400ms]"}`
                  : ""
              }`}
            >
              <CtaLink
                cta={payload.cta}
                bookingMessage={context.bookingMessage}
                dark
              />
            </div>
          </ScrollFade>
          {context.heroSize === "full" ? (
            <span
              className="absolute right-(--gutter) bottom-[clamp(4.5rem,9vw,7rem)] z-1 hidden items-center gap-4 text-[0.6875rem] tracking-[0.32em] text-inverse-strong uppercase [writing-mode:vertical-rl] after:h-18 after:w-px after:bg-[linear-gradient(var(--color-gold-400),transparent)] after:content-[''] lg:flex"
              aria-hidden="true"
            >
              Scroll
            </span>
          ) : null}
          <BrushEdge className={brushEdge} />
        </section>
      );
    }
    case "RICH_TEXT": {
      const image = first(section.images.PRIMARY);
      return (
        <section
          data-light-section=""
          className={`${lightSection} ${container} grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start gap-x-[clamp(2rem,7vw,7rem)] gap-y-8 max-lg:grid-cols-[minmax(0,1fr)]`}
          aria-labelledby={labelledBy}
        >
          <SectionHeading section={section} id={labelledBy} flush />
          <div className="grid gap-10 only:col-[1/-1]">
            <Reveal delay={0.1}>
              <RichTextView document={payload.document} className={proseLead} />
            </Reveal>
            {image ? (
              <RevealImage className="">
                <SiteImage
                  image={image}
                  sizes="(min-width: 64rem) 55vw, 100vw"
                  className="block h-auto w-full"
                />
              </RevealImage>
            ) : null}
          </div>
        </section>
      );
    }
    case "IMAGE_TEXT_SPLIT": {
      const image = first(section.images.PRIMARY);
      return (
        <section
          data-light-section=""
          className={`${container} grid items-center gap-[clamp(3rem,8vw,8rem)] py-(--space-section) [[data-light-section]+&]:pt-[calc(var(--space-section)*0.35)] ${
            image
              ? "grid-cols-[repeat(2,minmax(0,1fr))] max-md:grid-cols-[minmax(0,1fr)]"
              : "grid-cols-[minmax(0,1fr)]"
          }`}
          aria-labelledby={labelledBy}
        >
          {image ? (
            <div
              className={`${goldFrame} ${payload.imageSide === "RIGHT" ? "order-2 max-md:order-0" : ""}`}
            >
              <RevealImage
                className={`relative overflow-hidden bg-plum-100 ${image.height > image.width ? "aspect-[4/5]" : "aspect-[5/4]"}`}
              >
                <SiteImage
                  image={image}
                  fill
                  sizes="(min-width: 64rem) 45vw, 100vw"
                />
              </RevealImage>
            </div>
          ) : null}
          <Reveal
            className="grid justify-items-start"
            stagger={0.1}
            delay={0.15}
          >
            {section.eyebrow ? (
              <RevealItem>
                <p className={eyebrow}>{section.eyebrow}</p>
              </RevealItem>
            ) : null}
            {section.heading ? (
              <RevealItem>
                <h2 id={id} className={sectionHeading}>
                  {section.heading}
                </h2>
              </RevealItem>
            ) : null}
            <RevealItem>
              <RichTextView
                document={payload.body}
                className={`${proseInSection} mt-6`}
              />
            </RevealItem>
            <RevealItem className={actions}>
              <CtaLink
                cta={payload.cta}
                bookingMessage={context.bookingMessage}
              />
            </RevealItem>
          </Reveal>
        </section>
      );
    }
    case "GALLERY":
      return (
        <section
          data-light-section=""
          className={`${lightSection} ${container}`}
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
          data-light-section=""
          className={`${container} ${
            section.type === "STATS"
              ? "pt-0 pb-(--space-section) [[data-light-section]+&]:pt-[calc(var(--space-section)*0.35)]"
              : lightSection
          }`}
          aria-labelledby={labelledBy}
        >
          <SectionHeading section={section} id={labelledBy} />
          {section.type === "STATS" ? (
            <Reveal
              as="dl"
              className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] border-y border-neutral-300"
              stagger={0.12}
            >
              {items.map((item, index) => (
                <RevealItem
                  key={index}
                  className="flex flex-col items-center gap-3 px-6 py-[clamp(2rem,5vw,3.5rem)] text-center not-first:border-l not-first:border-neutral-300 max-md:not-first:border-t max-md:not-first:border-l-0"
                >
                  <dt className="text-[0.8125rem] font-medium tracking-[0.22em] text-neutral-600 uppercase">
                    {text(item.label)}
                  </dt>
                  <dd className="-order-1 m-0 font-display text-[clamp(3rem,2rem+4vw,5.5rem)] leading-none text-plum-700">
                    <CountUp value={text(item.value)} />
                  </dd>
                </RevealItem>
              ))}
            </Reveal>
          ) : (
            <Reveal
              as="ul"
              className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-x-[clamp(1.5rem,4vw,3rem)] gap-y-10 p-0"
              stagger={0.1}
            >
              {items.map((item, index) => (
                <RevealItem
                  as="li"
                  key={index}
                  className="grid content-start gap-3 border-t border-neutral-300 pt-6"
                >
                  <span
                    className="font-display tracking-[0.1em] text-gold-600"
                    aria-hidden="true"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="m-0 font-display text-heading-md font-normal text-plum-800">
                    {text(item.title)}
                  </h3>
                  <p className="m-0 text-neutral-600">{text(item.body)}</p>
                </RevealItem>
              ))}
            </Reveal>
          )}
        </section>
      );
    }
    case "ROOM_GRID": {
      const rooms = grid(context.rooms, payload);
      if (rooms.length === 0) return null;
      return (
        <section
          data-light-section=""
          className={`${lightSection} ${container}`}
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
        <section
          data-dark-surface=""
          className="bg-plum-900 text-surface"
          aria-labelledby={labelledBy}
        >
          <div className={`py-(--space-section) ${container}`}>
            <SectionHeading
              section={section}
              id={labelledBy}
              link={{ href: "/facilities", label: "View all amenities" }}
              onPlum
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
          className="relative isolate overflow-hidden [background:radial-gradient(ellipse_at_10%_0%,rgb(101_42_76/0.75),transparent_55%),var(--color-plum-900)] py-(--space-section) text-surface"
          aria-labelledby={labelledBy}
        >
          {background ? (
            <div className="absolute inset-0 -z-1 opacity-18">
              <SiteImage image={background} fill decorative sizes="100vw" />
            </div>
          ) : null}
          <div
            className={`${container} grid ${
              form
                ? "grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start justify-items-stretch gap-[clamp(2.5rem,7vw,7rem)] text-start max-lg:grid-cols-[minmax(0,1fr)]"
                : "justify-items-center text-center"
            }`}
          >
            <Reveal
              data-dark-surface=""
              className={`grid *:max-w-full ${form ? "justify-items-start" : "justify-items-center"}`}
            >
              {section.eyebrow ? (
                <p className={eyebrowDark}>{section.eyebrow}</p>
              ) : null}
              {section.heading ? (
                <h2
                  id={id}
                  className="m-0 max-w-[20ch]! font-display text-display-lg leading-[1.08] font-normal tracking-[-0.005em] text-balance text-surface"
                >
                  {section.heading}
                </h2>
              ) : null}
              <p className="mt-6 mb-0 max-w-[32rem] text-body-lg text-inverse-strong">
                {text(payload.body)}
              </p>
              {details && (details.phone || details.email) ? (
                <address className="mt-10 grid gap-2 border-t border-inverse-line-subtle pt-6 not-italic">
                  {details.phone ? (
                    <a
                      href={`tel:${details.phone.replace(/[^+0-9]/g, "")}`}
                      className={CONTACT_LINK}
                    >
                      <Icon name="phone" className={CONTACT_ICON} />
                      {details.phone}
                    </a>
                  ) : null}
                  {details.email ? (
                    <a
                      href={`mailto:${details.email}`}
                      className={CONTACT_LINK}
                    >
                      <Icon name="mail" className={CONTACT_ICON} />
                      {details.email}
                    </a>
                  ) : null}
                </address>
              ) : null}
              {form ? null : (
                <div className={actions}>
                  <Link
                    href="/contact"
                    className={button("primary-dark", actionFill)}
                  >
                    Get in touch
                  </Link>
                </div>
              )}
            </Reveal>
            {form ? <Reveal delay={0.15}>{form}</Reveal> : null}
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
