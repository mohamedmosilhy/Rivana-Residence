import type { Metadata } from "next";

import { getPublishedFacilities } from "@/composition/public";
import { CardGrid, FacilityCard } from "@/presentation/site/cards";

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
    <section
      className="site-section site-container"
      aria-labelledby="facilities-title"
    >
      <header className="site-page-header">
        <h1 id="facilities-title">Facilities</h1>
        <p>Places to relax and keep active during your stay.</p>
      </header>
      {facilities.length > 0 ? (
        <CardGrid>
          {facilities.map((facility) => (
            <FacilityCard
              key={facility.slug}
              facility={facility}
              headingLevel={2}
            />
          ))}
        </CardGrid>
      ) : (
        <p>
          Facility details are coming soon. Please contact us for information.
        </p>
      )}
    </section>
  );
}
