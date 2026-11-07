import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { breadcrumbJsonLd } from "@/application/public/seo";
import {
  getPublicOrigin,
  getPublishedFacility,
  getPublishedRooms,
} from "@/composition/public";
import { RichTextView } from "@/presentation/design/rich-text-view";
import { CardGrid, RoomCard } from "@/presentation/site/cards";
import { Gallery } from "@/presentation/site/gallery";
import { DetailHero } from "@/presentation/site/heroes";
import { Icon } from "@/presentation/site/icons";
import { StructuredData } from "@/presentation/site/structured-data";

import { pageMetadata, requireBranch, stayTitle } from "../../../site-content";
import {
  button,
  container,
  detailAside,
  detailLayout,
  eyebrow,
  eyebrowFlush,
  flushSection,
  lightSection,
  link,
  linkIcon,
  proseLeadPlain,
  sectionHeader,
  sectionHeading,
} from "@/presentation/site/classes";

type FacilityPageProps = Readonly<{
  params: Promise<{ branch: string; slug: string }>;
}>;

export async function generateMetadata({
  params,
}: FacilityPageProps): Promise<Metadata> {
  const branch = await requireBranch(params);
  const facility = await getPublishedFacility(branch, (await params).slug);
  if (!facility) return {};
  return pageMetadata({
    title: facility.seoTitle ?? facility.name,
    description: facility.seoDescription ?? facility.shortDescription,
    image: facility.socialImage ?? facility.hero,
    path: `/${branch.slug}/facilities/${facility.slug}`,
  });
}

export default async function FacilityPage({ params }: FacilityPageProps) {
  const branch = await requireBranch(params);
  const { slug } = await params;
  // Another branch's facility is not found here (spec 0002).
  const [facility, rooms] = await Promise.all([
    getPublishedFacility(branch, slug),
    getPublishedRooms(branch),
  ]);
  if (!facility) notFound();
  const origin = getPublicOrigin();
  const base = `/${branch.slug}`;
  const label = stayTitle(branch);

  return (
    <article>
      <StructuredData
        id="breadcrumb-structured-data"
        data={breadcrumbJsonLd(origin, [
          { name: branch.name, path: base },
          { name: "Facilities", path: `${base}/facilities` },
          {
            name: facility.name,
            path: `${base}/facilities/${facility.slug}`,
          },
        ])}
      />
      <DetailHero
        parent={{ href: `${base}/facilities` as Route, label: "Facilities" }}
        title={facility.name}
        lede={facility.shortDescription}
        image={facility.hero}
        morphName={`facility-${facility.slug}`}
      />
      <div className={`${container} ${detailLayout}`}>
        <div className="grid gap-12">
          <RichTextView
            document={facility.description}
            className={proseLeadPlain}
          />
        </div>
        <aside className={detailAside} aria-labelledby="facility-visit">
          <p className={eyebrowFlush} id="facility-visit">
            Plan your visit
          </p>
          {facility.openingHoursText ? (
            <dl className="m-0 grid">
              <div className="flex items-baseline justify-between gap-4 border-b border-neutral-300 py-4 first:border-t first:border-neutral-300">
                <dt className="text-[0.75rem] font-medium tracking-[0.18em] text-neutral-600 uppercase">
                  Opening hours
                </dt>
                <dd className="m-0 text-right font-display text-[1.125rem] text-plum-900">
                  {facility.openingHoursText}
                </dd>
              </div>
            </dl>
          ) : null}
          <Link
            href={`${base}/contact` as Route}
            className={button("primary", "w-full")}
          >
            Ask about {facility.name}
          </Link>
        </aside>
      </div>
      {facility.gallery.length > 0 ? (
        <section
          data-light-section=""
          className={`${flushSection} ${container}`}
          aria-labelledby="facility-gallery"
        >
          <header className={sectionHeader}>
            <div>
              <p className={eyebrow}>Gallery</p>
              <h2 id="facility-gallery" className={sectionHeading}>
                Photos
              </h2>
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
          data-light-section=""
          className={`${lightSection} ${container}`}
          aria-labelledby="facility-rooms"
        >
          <header className={sectionHeader}>
            <div>
              <p className={eyebrow}>{label}</p>
              <h2 id="facility-rooms" className={sectionHeading}>
                Stay with us
              </h2>
            </div>
            <Link href={`${base}/stay` as Route} className={link}>
              View all {label.toLowerCase()}
              <Icon name="arrow" className={linkIcon} />
            </Link>
          </header>
          <CardGrid>
            {rooms.slice(0, 3).map((room, index) => (
              <RoomCard
                key={room.slug}
                branchSlug={branch.slug}
                room={room}
                index={index}
              />
            ))}
          </CardGrid>
        </section>
      ) : null}
    </article>
  );
}
