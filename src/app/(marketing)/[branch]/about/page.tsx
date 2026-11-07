import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { pagePath } from "@/application/public/seo";
import { getPublishedPage } from "@/composition/public";

import {
  ManagedPageSections,
  managedPageMetadata,
  requireBranch,
  type BranchParams,
} from "../../site-content";

export async function generateMetadata({
  params,
}: BranchParams): Promise<Metadata> {
  const branch = await requireBranch(params);
  const page = await getPublishedPage(branch, "ABOUT");
  return managedPageMetadata(branch, page, {
    title: page?.title ?? "About",
    path: pagePath(branch.slug, "ABOUT"),
  });
}

export default async function AboutPage({ params }: BranchParams) {
  const branch = await requireBranch(params);
  const page = await getPublishedPage(branch, "ABOUT");
  if (!page) notFound();
  return <ManagedPageSections page={page} branch={branch} />;
}
