import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPublishedFacilities, getPublishedRoom } from "@/composition/public";
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

import { bookingMessage, pageMetadata } from "../../site-content";

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
    image: room.hero,
    path: `/rooms/${room.slug}`,
  });
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { slug } = await params;
  const [room, facilities, message] = await Promise.all([
    getPublishedRoom(slug),
    getPublishedFacilities(),
    bookingMessage(),
  ]);
  if (!room) notFound();
  const facts = roomFactList(room.facts);

  return (
    <article className="site-detail">
      <DetailHero
        parent={{ href: "/rooms", label: "Rooms" }}
        title={room.name}
        lede={room.shortDescription}
        image={room.hero}
      >
        <BookNowButton message={message} />
        <Link href="/contact" className="site-button site-button--ghost">
          Enquire about this room
        </Link>
      </DetailHero>

      <div className="site-container site-detail__layout">
        <div className="site-detail__main">
          <RichTextView
            document={room.description}
            className="site-prose site-prose--lead"
          />
          {room.features.length > 0 ? (
            <section aria-labelledby="room-features">
              <h2 id="room-features">In the room</h2>
              <ul className="site-feature-list">
                {room.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <aside className="site-detail__aside" aria-labelledby="room-facts">
          <p className="site-eyebrow" id="room-facts">
            At a glance
          </p>
          <dl className="site-facts">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
          <BookNowButton message={message} />
        </aside>
      </div>

      {room.gallery.length > 0 ? (
        <section
          className="site-section site-container site-section--flush"
          aria-labelledby="room-gallery"
        >
          <header className="site-section__header">
            <div>
              <p className="site-eyebrow">Gallery</p>
              <h2 id="room-gallery">Photos</h2>
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
        <section className="site-band" aria-labelledby="room-facilities">
          <div className="site-section site-container">
            <header className="site-section__header">
              <div>
                <p className="site-eyebrow">Amenities</p>
                <h2 id="room-facilities">During your stay</h2>
              </div>
              <Link href="/facilities" className="site-link">
                View all amenities
                <Icon name="arrow" />
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
