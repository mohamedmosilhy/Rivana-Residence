import type { Metadata } from "next";

import { pagePath } from "@/application/public/seo";
import { getPublishedPage, getSiteSettings } from "@/composition/public";
import { BranchLocation } from "@/presentation/site/branch-location";
import { PageHero } from "@/presentation/site/heroes";

import {
  ManagedPageSections,
  managedPageMetadata,
  requireBranch,
  type BranchParams,
} from "../site-content";

export async function generateMetadata({
  params,
}: BranchParams): Promise<Metadata> {
  const branch = await requireBranch(params);
  const [page, settings] = await Promise.all([
    getPublishedPage(branch, "HOME"),
    getSiteSettings(),
  ]);
  return managedPageMetadata(branch, page, {
    title: settings?.defaultSeoTitle ?? null,
    path: pagePath(branch.slug, "HOME"),
    home: true,
  });
}

export default async function BranchHomePage({ params }: BranchParams) {
  const branch = await requireBranch(params);
  const page = await getPublishedPage(branch, "HOME");
  return (
    <>
      {page ? (
        <ManagedPageSections page={page} branch={branch} />
      ) : (
        // Until the branch's Home page is published, show a quiet holding
        // page rather than draft content.
        <PageHero
          size="screen"
          title={branch.name}
          titleId="holding-title"
          intro="Our new website is being prepared. Please contact us directly in the meantime."
        />
      )}
      <BranchLocation branch={branch} />
    </>
  );
}
