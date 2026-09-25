import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPublishedFacility, getPublishedRooms } from "@/composition/public";
import { RichTextView } from "@/presentation/design/rich-text-view";
import { CardGrid, RoomCard } from "@/presentation/site/cards";
import { Gallery } from "@/presentation/site/gallery";
import { DetailHero } from "@/presentation/site/heroes";
import { Icon } from "@/presentation/site/icons";

import { pageMetadata } from "../../site-content";

type FacilityPageProps = Readonly<{ params: Promise<{ slug: string }> }>;

export async function generateMetadata({
  params,
}: FacilityPageProps): Promise<Metadata> {
  const { slug } = await params;
  const facility = await getPublishedFacility(slug);
  if (!facility) return {};
  return pageMetadata({
    title: facility.seoTitle ?? facility.name,
    description: facility.seoDescription ?? facility.shortDescription,
    image: facility.hero,
    path: `/facilities/${facility.slug}`,
  });
}

export default async function FacilityPage({ params }: FacilityPageProps) {
  const { slug } = await params;
  const [facility, rooms] = await Promise.all([
    getPublishedFacility(slug),
    getPublishedRooms(),
  ]);
  if (!facility) notFound();

  return (
    <article className="site-detail">
      <DetailHero
        parent={{ href: "/facilities", label: "Facilities" }}
        title={facility.name}
        lede={facility.shortDescription}
        image={facility.hero}
      />
      <div className="site-container site-detail__layout">
        <div className="site-detail__main">
          <RichTextView
            document={facility.description}
            className="site-prose site-prose--lead"
          />
        </div>
        <aside className="site-detail__aside" aria-labelledby="facility-visit">
          <p className="site-eyebrow" id="facility-visit">
            Plan your visit
          </p>
          {facility.openingHoursText ? (
            <dl className="site-facts">
              <div>
                <dt>Opening hours</dt>
                <dd>{facility.openingHoursText}</dd>
              </div>
            </dl>
          ) : null}
          <Link href="/contact" className="site-button">
            Ask about {facility.name}
          </Link>
        </aside>
      </div>
      {facility.gallery.length > 0 ? (
        <section
          className="site-section site-container site-section--flush"
          aria-labelledby="facility-gallery"
        >
          <header className="site-section__header">
            <div>
              <p className="site-eyebrow">Gallery</p>
              <h2 id="facility-gallery">Photos</h2>
            </div>
          </header>
          <Gallery
            images={facility.gallery}
            label={`Photos of ${facility.name}`}
            layout="EDITORIAL"
          />
        </section>
      ) : null}
      {rooms.length > 0 ? (
        <section
          className="site-section site-container"
          aria-labelledby="facility-rooms"
        >
          <header className="site-section__header">
            <div>
              <p className="site-eyebrow">Rooms</p>
              <h2 id="facility-rooms">Stay with us</h2>
            </div>
            <Link href="/rooms" className="site-link">
              View all rooms
              <Icon name="arrow" />
            </Link>
          </header>
          <CardGrid>
            {rooms.slice(0, 3).map((room, index) => (
              <RoomCard key={room.slug} room={room} index={index} />
            ))}
          </CardGrid>
        </section>
      ) : null}
    </article>
  );
}
