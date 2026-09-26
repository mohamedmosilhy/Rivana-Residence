import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { breadcrumbJsonLd, roomJsonLd } from "@/application/public/seo";
import {
  getPublicOrigin,
  getPublishedFacilities,
  getPublishedRoom,
  getSiteSettings,
} from "@/composition/public";
import { RichTextView } from "@/presentation/design/rich-text-view";
import { BookNowButton } from "@/presentation/site/book-now-button";
import {
  CardGrid,
  FacilityCard,
  roomFactList,
} from "@/presentation/site/cards";
import { Gallery } from "@/presentation/site/gallery";
import { DetailHero } from "@/presentation/site/heroes";
import { Icon } from "@/presentation/site/icons";
import { StructuredData } from "@/presentation/site/structured-data";

import { bookingMessage, pageMetadata } from "../../site-content";
import {
  actionFill,
  button,
  container,
  detailAside,
  detailHeading,
  detailLayout,
  eyebrow,
  eyebrowDark,
  eyebrowFlush,
  featureItem,
  featureList,
  flushSection,
  linkIcon,
  linkInverse,
  proseLeadPlain,
  sectionHeader,
  sectionHeading,
  sectionHeadingOnPlum,
} from "@/presentation/site/classes";

type RoomPageProps = Readonly<{ params: Promise<{ slug: string }> }>;

export async function generateMetadata({
  params,
}: RoomPageProps): Promise<Metadata> {
  const { slug } = await params;
  const room = await getPublishedRoom(slug);
  if (!room) return {};
  return pageMetadata({
    title: room.seoTitle ?? room.name,
    description: room.seoDescription ?? room.shortDescription,
    image: room.socialImage ?? room.hero,
    path: `/rooms/${room.slug}`,
  });
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { slug } = await params;
  const [room, facilities, message, settings] = await Promise.all([
    getPublishedRoom(slug),
    getPublishedFacilities(),
    bookingMessage(),
    getSiteSettings(),
  ]);
  if (!room) notFound();
  const facts = roomFactList(room.facts);
  const origin = getPublicOrigin();

  return (
    <article>
      <StructuredData
        id="room-structured-data"
        data={roomJsonLd(room, settings, origin)}
      />
      <StructuredData
        id="breadcrumb-structured-data"
        data={breadcrumbJsonLd(origin, [
          { name: "Home", path: "/" },
          { name: "Rooms", path: "/rooms" },
          { name: room.name, path: `/rooms/${room.slug}` },
        ])}
      />
      <DetailHero
        parent={{ href: "/rooms", label: "Rooms" }}
        title={room.name}
        lede={room.shortDescription}
        image={room.hero}
        morphName={`room-${room.slug}`}
      >
        <BookNowButton message={message} placement="dark" inActions />
        <Link href="/contact" className={button("ghost-dark", actionFill)}>
          Enquire about this room
        </Link>
      </DetailHero>

      <div className={`${container} ${detailLayout}`}>
        <div className="grid gap-12">
          <RichTextView
            document={room.description}
            className={proseLeadPlain}
          />
          {room.features.length > 0 ? (
            <section aria-labelledby="room-features">
              <h2 id="room-features" className={detailHeading}>
                In the room
              </h2>
              <ul className={featureList}>
                {room.features.map((feature) => (
                  <li key={feature} className={featureItem}>
                    {feature}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <aside className={detailAside} aria-labelledby="room-facts">
          <p className={eyebrowFlush} id="room-facts">
            At a glance
          </p>
          <dl className="m-0 grid">
            {facts.map((fact) => (
              <div
                key={fact.label}
                className="flex items-baseline justify-between gap-4 border-b border-neutral-300 py-4 first:border-t first:border-neutral-300"
              >
                <dt className="text-[0.75rem] font-medium tracking-[0.18em] text-neutral-600 uppercase">
                  {fact.label}
                </dt>
                <dd className="m-0 text-right font-display text-[1.125rem] text-plum-900">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
          <BookNowButton message={message} fill />
        </aside>
      </div>

      {room.gallery.length > 0 ? (
        <section
          data-light-section=""
          className={`${flushSection} ${container}`}
          aria-labelledby="room-gallery"
        >
          <header className={sectionHeader}>
            <div>
              <p className={eyebrow}>Gallery</p>
              <h2 id="room-gallery" className={sectionHeading}>
                Photos
              </h2>
            </div>
          </header>
          <Gallery
            images={room.gallery}
            label={`Photos of ${room.name}`}
            layout="EDITORIAL"
          />
        </section>
      ) : null}

      {facilities.length > 0 ? (
        <section
          data-dark-surface=""
          className="bg-plum-900 text-surface"
          aria-labelledby="room-facilities"
        >
          <div className={`py-(--space-section) ${container}`}>
            <header className={sectionHeader}>
              <div>
                <p className={eyebrowDark}>Amenities</p>
                <h2 id="room-facilities" className={sectionHeadingOnPlum}>
                  During your stay
                </h2>
              </div>
              <Link href="/facilities" className={linkInverse}>
                View all amenities
                <Icon name="arrow" className={linkIcon} />
              </Link>
            </header>
            <CardGrid variant="tiles">
              {facilities.slice(0, 3).map((facility) => (
                <FacilityCard key={facility.slug} facility={facility} />
              ))}
            </CardGrid>
          </div>
        </section>
      ) : null}
    </article>
  );
}
