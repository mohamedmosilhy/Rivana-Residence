import type { Metadata } from "next";

import { breadcrumbJsonLd } from "@/application/public/seo";
import { getPublicOrigin, getPublishedFacilities } from "@/composition/public";
import { CardGrid, FacilityCard } from "@/presentation/site/cards";
import { PageHero } from "@/presentation/site/heroes";
import { StructuredData } from "@/presentation/site/structured-data";

import {
  branchTitle,
  pageMetadata,
  requireBranch,
  type BranchParams,
} from "../../site-content";
import { container, empty, lightSection } from "@/presentation/site/classes";

export async function generateMetadata({
  params,
}: BranchParams): Promise<Metadata> {
  const branch = await requireBranch(params);
  return pageMetadata({
    title: await branchTitle("Facilities", branch),
    description: `Facilities at ${branch.name}${branch.city ? `, ${branch.city}` : ""}.`,
    path: `/${branch.slug}/facilities`,
  });
}

export default async function FacilitiesPage({ params }: BranchParams) {
  const branch = await requireBranch(params);
  const facilities = await getPublishedFacilities(branch);
  return (
    <>
      <StructuredData
        id="breadcrumb-structured-data"
        data={breadcrumbJsonLd(getPublicOrigin(), [
          { name: branch.name, path: `/${branch.slug}` },
          { name: "Facilities", path: `/${branch.slug}/facilities` },
        ])}
      />
      <PageHero
        eyebrow="Life at Rivana"
        title="Facilities"
        titleId="facilities-title"
        intro="Places to relax and keep active during your stay."
      />
      <section
        data-light-section=""
        className={`${lightSection} ${container}`}
        aria-labelledby="facilities-title"
      >
        {facilities.length > 0 ? (
          <CardGrid variant="tiles">
            {facilities.map((facility) => (
              <FacilityCard
                key={facility.slug}
                branchSlug={branch.slug}
                facility={facility}
                headingLevel={2}
              />
            ))}
          </CardGrid>
        ) : (
          <p className={empty}>
            Facility details are coming soon. Please contact us for information.
          </p>
        )}
      </section>
    </>
  );
}
