import type { Route } from "next";
import Link from "next/link";

import type {
  PublicFacilityCard,
  PublicRoomCard,
  PublicRoomFacts,
} from "@/application/public/view-models";
import { Icon } from "@/presentation/site/icons";
import { SiteImage } from "@/presentation/site/site-image";

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
    <article className="site-card">
      <div className="site-card__media">
        {room.hero ? (
          <SiteImage
            image={room.hero}
            fill
            decorative
            sizes="(min-width: 64rem) 30vw, (min-width: 40rem) 50vw, 100vw"
          />
        ) : null}
      </div>
      <div className="site-card__body">
        {index !== undefined ? (
          <p className="site-card__index" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </p>
        ) : null}
        <Heading className="site-card__title">
          <Link
            href={`/rooms/${room.slug}` as Route}
            className="site-card__link"
          >
            {room.name}
          </Link>
        </Heading>
        <p className="site-card__text">{room.shortDescription}</p>
        {facts.length > 0 ? (
          <ul className="site-card__meta" aria-label="Room facts">
            {facts.map((fact) => (
              <li key={fact.label}>{fact.value}</li>
            ))}
          </ul>
        ) : null}
        <span className="site-card__more" aria-hidden="true">
          Discover
          <Icon name="arrow" />
        </span>
      </div>
    </article>
  );
}

export function FacilityCard({
  facility,
  headingLevel = 3,
}: Readonly<{ facility: PublicFacilityCard; headingLevel?: 2 | 3 }>) {
  const Heading = `h${headingLevel}` as const;
  return (
    <article className="site-tile">
      <div className="site-tile__media">
        {facility.hero ? (
          <SiteImage
            image={facility.hero}
            fill
            decorative
            sizes="(min-width: 64rem) 45vw, 100vw"
          />
        ) : null}
      </div>
      <div className="site-tile__body">
        <Heading className="site-tile__title">
          <Link
            href={`/facilities/${facility.slug}` as Route}
            className="site-card__link"
          >
            {facility.name}
          </Link>
        </Heading>
        <p className="site-tile__text">{facility.shortDescription}</p>
        {facility.openingHoursText ? (
          <p className="site-tile__meta">
            <Icon name="clock" />
            {facility.openingHoursText}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function CardGrid({
  children,
  variant = "rooms",
}: Readonly<{ children: React.ReactNode; variant?: "rooms" | "tiles" }>) {
  return (
    <div className={variant === "rooms" ? "site-card-grid" : "site-tile-grid"}>
      {children}
    </div>
  );
}
