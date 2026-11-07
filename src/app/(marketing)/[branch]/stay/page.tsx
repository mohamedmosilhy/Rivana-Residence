import type { Metadata } from "next";

import { breadcrumbJsonLd } from "@/application/public/seo";
import { getPublicOrigin, getPublishedRooms } from "@/composition/public";
import { CardGrid, RoomCard } from "@/presentation/site/cards";
import { PageHero } from "@/presentation/site/heroes";
import { StructuredData } from "@/presentation/site/structured-data";

import {
  branchTitle,
  pageMetadata,
  requireBranch,
  stayTitle,
  type BranchParams,
} from "../../site-content";
import { container, empty, lightSection } from "@/presentation/site/classes";

function intro(label: string) {
  return label === "Apartments"
    ? "Each apartment, with its size, bedrooms, who it sleeps, and what it includes."
    : label === "Rooms & Apartments"
      ? "Each room and apartment, with its size, who it sleeps, and what it includes."
      : "Each room type, with its size, who it sleeps, and what it includes.";
}

export async function generateMetadata({
  params,
}: BranchParams): Promise<Metadata> {
  const branch = await requireBranch(params);
  const label = stayTitle(branch);
  const kinds = label === "Rooms" ? "Room types" : label;
  return pageMetadata({
    title: await branchTitle(label, branch),
    description: `${kinds} at ${branch.name}${branch.city ? `, ${branch.city}` : ""}.`,
    path: `/${branch.slug}/stay`,
  });
}

export default async function StayPage({ params }: BranchParams) {
  const branch = await requireBranch(params);
  const rooms = await getPublishedRooms(branch);
  const label = stayTitle(branch);
  return (
    <>
      <StructuredData
        id="breadcrumb-structured-data"
        data={breadcrumbJsonLd(getPublicOrigin(), [
          { name: branch.name, path: `/${branch.slug}` },
          { name: label, path: `/${branch.slug}/stay` },
        ])}
      />
      <PageHero
        eyebrow="Stay with us"
        title={label}
        titleId="rooms-title"
        intro={intro(label)}
      />
      <section
        data-light-section=""
        className={`${lightSection} ${container}`}
        aria-labelledby="rooms-title"
      >
        {rooms.length > 0 ? (
          <CardGrid>
            {rooms.map((room, index) => (
              <RoomCard
                key={room.slug}
                branchSlug={branch.slug}
                room={room}
                index={index}
                headingLevel={2}
              />
            ))}
          </CardGrid>
        ) : (
          <p className={empty}>
            Room details are coming soon. Please contact us for information.
          </p>
        )}
      </section>
    </>
  );
}
