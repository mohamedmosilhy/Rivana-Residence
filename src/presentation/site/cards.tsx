import type { Route } from "next";
import Link from "next/link";

import type {
  PublicFacilityCard,
  PublicRoomCard,
  PublicRoomFacts,
} from "@/application/public/view-models";
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

function Card({
  href,
  title,
  text,
  image,
  meta,
  headingLevel,
}: Readonly<{
  href: Route;
  title: string;
  text: string;
  image: PublicRoomCard["hero"];
  meta: readonly string[];
  headingLevel: 2 | 3;
}>) {
  const Heading = `h${headingLevel}` as const;
  return (
    <article className="site-card">
      <div className="site-card__media">
        {image ? (
          <SiteImage
            image={image}
            fill
            decorative
            sizes="(min-width: 64rem) 33vw, (min-width: 40rem) 50vw, 100vw"
          />
        ) : null}
      </div>
      <div className="site-card__body">
        <Heading className="site-card__title">
          <Link href={href} className="site-card__link">
            {title}
          </Link>
        </Heading>
        <p>{text}</p>
        {meta.length > 0 ? (
          <ul className="site-card__meta">
            {meta.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}

export function RoomCard({
  room,
  headingLevel = 3,
}: Readonly<{ room: PublicRoomCard; headingLevel?: 2 | 3 }>) {
  return (
    <Card
      href={`/rooms/${room.slug}` as Route}
      title={room.name}
      text={room.shortDescription}
      image={room.hero}
      meta={roomFactList(room.facts).map((fact) => fact.value)}
      headingLevel={headingLevel}
    />
  );
}

export function FacilityCard({
  facility,
  headingLevel = 3,
}: Readonly<{ facility: PublicFacilityCard; headingLevel?: 2 | 3 }>) {
  return (
    <Card
      href={`/facilities/${facility.slug}` as Route}
      title={facility.name}
      text={facility.shortDescription}
      image={facility.hero}
      meta={facility.openingHoursText ? [facility.openingHoursText] : []}
      headingLevel={headingLevel}
    />
  );
}

export function CardGrid({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="site-card-grid">{children}</div>;
}
