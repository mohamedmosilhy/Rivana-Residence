import type { Route } from "next";
import Link from "next/link";

import type {
  PublicFacilityCard,
  PublicRoomCard,
  PublicRoomFacts,
} from "@/application/public/view-models";
import { Icon } from "@/presentation/site/icons";
import { Reveal, RevealItem } from "@/presentation/site/motion/reveal";
import { SharedElement } from "@/presentation/site/motion/shared-element";
import { SiteImage } from "@/presentation/site/site-image";
import { sectionHeading } from "@/presentation/site/classes";

// A gold rule sweeps under the photo when the card is hovered.
const SWEEP =
  "after:absolute after:right-0 after:bottom-0 after:left-0 after:z-1 after:h-[3px] after:origin-right after:bg-gold-400 after:[transform:scaleX(0)] after:[transition:transform_600ms_var(--ease-out-soft)] after:content-['']";
const PHOTO = "[transition:transform_var(--motion-image)_var(--ease-out-soft)]";
/** The title link stretches over the whole card. */
const CARD_LINK =
  "after:absolute after:inset-0 after:z-1 after:content-[''] focus-visible:[outline:none]";

/** Verified marketing facts only; never prices or availability. */
export function roomFactList(facts: PublicRoomFacts) {
  const guests = [
    `${facts.maxAdults} adult${facts.maxAdults === 1 ? "" : "s"}`,
    facts.maxChildren > 0
      ? `${facts.maxChildren} child${facts.maxChildren === 1 ? "" : "ren"}`
      : null,
  ]
    .filter(Boolean)
    .join(" + ");
  return [
    facts.sizeSqm ? { label: "Size", value: `${facts.sizeSqm} m²` } : null,
    { label: "Sleeps", value: guests },
    facts.bedSummary ? { label: "Beds", value: facts.bedSummary } : null,
    facts.viewSummary ? { label: "View", value: facts.viewSummary } : null,
  ].filter((fact): fact is { label: string; value: string } => fact !== null);
}

export function RoomCard({
  room,
  headingLevel = 3,
  index,
}: Readonly<{
  room: PublicRoomCard;
  headingLevel?: 2 | 3;
  /** Position in an editorial list, shown as "01", "02"… */
  index?: number;
}>) {
  const Heading = `h${headingLevel}` as const;
  const facts = roomFactList(room.facts).slice(0, 3);
  return (
    <RevealItem
      as="article"
      className="group/card relative grid content-start gap-6 focus-within:[outline:3px_solid_var(--color-focus)] focus-within:[outline-offset:6px] md:max-lg:last:odd:not-only:col-[1/-1] md:max-lg:last:odd:not-only:grid-cols-[repeat(2,minmax(0,1fr))] md:max-lg:last:odd:not-only:items-center md:max-lg:last:odd:not-only:gap-8"
    >
      <SharedElement name={`room-${room.slug}`}>
        <div
          className={`relative aspect-[4/5] overflow-hidden bg-plum-100 ${SWEEP} can-hover:group-hover/card:after:origin-left can-hover:group-hover/card:after:[transform:scaleX(1)]`}
        >
          {room.hero ? (
            <SiteImage
              image={room.hero}
              fill
              decorative
              className={`${PHOTO} can-hover:group-hover/card:[transform:scale(1.03)]`}
              sizes="(min-width: 64rem) 30vw, (min-width: 40rem) 50vw, 100vw"
            />
          ) : null}
        </div>
      </SharedElement>
      <div className="grid justify-items-start gap-3">
        {index !== undefined ? (
          <p
            className="m-0 flex items-center gap-3 font-display text-[1rem] tracking-[0.1em] text-gold-600 after:h-px after:w-8 after:bg-current after:content-['']"
            aria-hidden="true"
          >
            {String(index + 1).padStart(2, "0")}
          </p>
        ) : null}
        <Heading
          className={
            headingLevel === 2
              ? sectionHeading
              : "m-0 font-display text-heading-lg leading-[1.15] font-normal text-plum-900"
          }
        >
          <Link href={`/rooms/${room.slug}` as Route} className={CARD_LINK}>
            {room.name}
          </Link>
        </Heading>
        <p className="m-0 max-w-[36ch] text-neutral-600">
          {room.shortDescription}
        </p>
        {facts.length > 0 ? (
          <ul
            className="m-0 flex flex-wrap items-center p-0 text-[0.875rem] text-neutral-800"
            aria-label="Room facts"
          >
            {facts.map((fact) => (
              <li
                key={fact.label}
                className="not-first:before:mx-3 not-first:before:inline-block not-first:before:size-1 not-first:before:bg-gold-400 not-first:before:[transform:translateY(-0.2em)_rotate(45deg)] not-first:before:content-['']"
              >
                {fact.value}
              </li>
            ))}
          </ul>
        ) : null}
        <span
          className="mt-2 inline-flex items-center gap-3 text-[0.75rem] font-medium tracking-[0.22em] text-plum-800 uppercase"
          aria-hidden="true"
        >
          Discover
          <Icon
            name="arrow"
            className="size-[1.125rem] flex-none [transition:transform_var(--motion-fast)_ease] can-hover:group-hover/card:[transform:translateX(0.25rem)]"
          />
        </span>
      </div>
    </RevealItem>
  );
}

export function FacilityCard({
  facility,
  headingLevel = 3,
}: Readonly<{ facility: PublicFacilityCard; headingLevel?: 2 | 3 }>) {
  const Heading = `h${headingLevel}` as const;
  return (
    <RevealItem
      as="article"
      className="group/tile relative isolate grid min-h-[clamp(22rem,38vw,32rem)] items-end overflow-hidden bg-plum-950 text-surface after:absolute after:inset-0 after:-z-1 after:bg-[linear-gradient(to_top,rgb(26_11_20/0.92)_0%,rgb(26_11_20/0.6)_38%,rgb(26_11_20/0.05)_72%)] after:content-[''] focus-within:[outline:3px_solid_var(--color-gold-400)] focus-within:[outline-offset:4px] lg:[[data-tile-grid]:has(>:nth-child(3))_&]:min-h-[clamp(26rem,40vw,34rem)]"
    >
      <SharedElement name={`facility-${facility.slug}`}>
        <div
          className={`absolute inset-0 -z-2 ${SWEEP} can-hover:group-hover/tile:after:origin-left can-hover:group-hover/tile:after:[transform:scaleX(1)]`}
        >
          {facility.hero ? (
            <SiteImage
              image={facility.hero}
              fill
              decorative
              className={`${PHOTO} can-hover:group-hover/tile:[transform:scale(1.03)]`}
              sizes="(min-width: 64rem) 45vw, 100vw"
            />
          ) : null}
        </div>
      </SharedElement>
      <div className="grid max-w-[30rem] gap-2 p-[clamp(1.5rem,3vw,2.5rem)]">
        <Heading
          className={`m-0 font-display text-heading-lg leading-[1.15] font-normal text-surface ${
            headingLevel === 2
              ? "max-w-[20ch] tracking-[-0.005em] text-balance"
              : ""
          }`}
        >
          <Link
            href={`/facilities/${facility.slug}` as Route}
            className={CARD_LINK}
          >
            {facility.name}
          </Link>
        </Heading>
        <p className="m-0 text-inverse-body">{facility.shortDescription}</p>
        {facility.openingHoursText ? (
          <p className="mt-2 mb-0 flex items-center gap-2 text-[0.8125rem] tracking-[0.12em] text-gold-400 uppercase">
            <Icon name="clock" className="size-4 flex-none" />
            {facility.openingHoursText}
          </p>
        ) : null}
      </div>
    </RevealItem>
  );
}

export function CardGrid({
  children,
  variant = "rooms",
}: Readonly<{ children: React.ReactNode; variant?: "rooms" | "tiles" }>) {
  return (
    <Reveal
      stagger={0.12}
      data-tile-grid={variant === "tiles" ? "" : undefined}
      className={
        variant === "rooms"
          ? "grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-x-[clamp(1.5rem,3vw,2.5rem)] gap-y-16 lg:grid-cols-[repeat(3,minmax(0,1fr))] lg:not-has-[>:nth-child(3)]:max-w-[58rem] lg:not-has-[>:nth-child(3)]:grid-cols-[repeat(2,minmax(0,1fr))] lg:has-[>:nth-child(3)]:[&>:nth-child(3n+2)]:mt-16"
          : "grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-[clamp(1rem,2vw,1.5rem)] lg:has-[>:nth-child(3)]:grid-cols-[repeat(3,minmax(0,1fr))]"
      }
    >
      {children}
    </Reveal>
  );
}
