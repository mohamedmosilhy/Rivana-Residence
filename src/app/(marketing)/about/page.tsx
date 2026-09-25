import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublishedPage } from "@/composition/public";

import { ManagedPageSections, pageMetadata } from "../site-content";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublishedPage("ABOUT");
  return pageMetadata({
    title: page?.seoTitle ?? page?.title ?? "About",
    description: page?.seoDescription ?? null,
    path: "/about",
  });
}

export default async function AboutPage() {
  const page = await getPublishedPage("ABOUT");
  if (!page) notFound();
  return <ManagedPageSections page={page} />;
}
