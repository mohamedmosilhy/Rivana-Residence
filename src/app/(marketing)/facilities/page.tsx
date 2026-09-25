import type { Metadata } from "next";

import { getPublishedFacilities } from "@/composition/public";
import { CardGrid, FacilityCard } from "@/presentation/site/cards";
import { PageHero } from "@/presentation/site/heroes";

import { pageMetadata } from "../site-content";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "Facilities",
    description: "Facilities at Rivana Residence, New Cairo.",
    path: "/facilities",
  });
}

export default async function FacilitiesPage() {
  const facilities = await getPublishedFacilities();
  return (
    <>
      <PageHero
        eyebrow="Life at Rivana"
        title="Facilities"
        titleId="facilities-title"
        intro="Places to relax and keep active during your stay."
      />
      <section
        className="site-section site-container"
        aria-labelledby="facilities-title"
      >
        {facilities.length > 0 ? (
          <CardGrid variant="tiles">
            {facilities.map((facility) => (
              <FacilityCard
                key={facility.slug}
                facility={facility}
                headingLevel={2}
              />
            ))}
          </CardGrid>
        ) : (
          <p className="site-empty">
            Facility details are coming soon. Please contact us for information.
          </p>
        )}
      </section>
    </>
  );
}
