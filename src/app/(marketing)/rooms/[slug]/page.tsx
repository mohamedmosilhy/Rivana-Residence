import type { Metadata } from "next";
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
import { SiteImage } from "@/presentation/site/site-image";

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
      <header className="site-detail__hero">
        {room.hero ? (
          <div className="site-detail__media">
            <SiteImage image={room.hero} fill preload sizes="100vw" />
          </div>
        ) : null}
        <div className="site-detail__intro site-container">
          <p className="site-eyebrow">Room</p>
          <h1>{room.name}</h1>
          <p className="site-detail__lede">{room.shortDescription}</p>
          <BookNowButton message={message} />
        </div>
      </header>

      <div className="site-container site-detail__body">
        <dl className="site-facts" aria-label="Room facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
        <div className="site-prose">
          <RichTextView document={room.description} />
        </div>
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
        {room.gallery.length > 0 ? (
          <section aria-labelledby="room-gallery">
            <h2 id="room-gallery">Photos</h2>
            <Gallery images={room.gallery} label={`Photos of ${room.name}`} />
          </section>
        ) : null}
      </div>

      {facilities.length > 0 ? (
        <section
          className="site-section site-container"
          aria-labelledby="room-facilities"
        >
          <h2 id="room-facilities">During your stay</h2>
          <CardGrid>
            {facilities.slice(0, 3).map((facility) => (
              <FacilityCard key={facility.slug} facility={facility} />
            ))}
          </CardGrid>
        </section>
      ) : null}
    </article>
  );
}
