import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublishedFacility, getPublishedRooms } from "@/composition/public";
import { RichTextView } from "@/presentation/design/rich-text-view";
import { CardGrid, RoomCard } from "@/presentation/site/cards";
import { Gallery } from "@/presentation/site/gallery";
import { SiteImage } from "@/presentation/site/site-image";

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
      <header className="site-detail__hero">
        {facility.hero ? (
          <div className="site-detail__media">
            <SiteImage image={facility.hero} fill preload sizes="100vw" />
          </div>
        ) : null}
        <div className="site-detail__intro site-container">
          <p className="site-eyebrow">Facility</p>
          <h1>{facility.name}</h1>
          <p className="site-detail__lede">{facility.shortDescription}</p>
        </div>
      </header>
      <div className="site-container site-detail__body">
        {facility.openingHoursText ? (
          <dl className="site-facts">
            <div>
              <dt>Opening hours</dt>
              <dd>{facility.openingHoursText}</dd>
            </div>
          </dl>
        ) : null}
        <div className="site-prose">
          <RichTextView document={facility.description} />
        </div>
        {facility.gallery.length > 0 ? (
          <section aria-labelledby="facility-gallery">
            <h2 id="facility-gallery">Photos</h2>
            <Gallery
              images={facility.gallery}
              label={`Photos of ${facility.name}`}
            />
          </section>
        ) : null}
      </div>
      {rooms.length > 0 ? (
        <section
          className="site-section site-container"
          aria-labelledby="facility-rooms"
        >
          <h2 id="facility-rooms">Stay with us</h2>
          <CardGrid>
            {rooms.slice(0, 3).map((room) => (
              <RoomCard key={room.slug} room={room} />
            ))}
          </CardGrid>
        </section>
      ) : null}
    </article>
  );
}
