import type { Metadata } from "next";

import { getPublishedPage, getSiteSettings } from "@/composition/public";

import { ManagedPageSections, pageMetadata } from "./site-content";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublishedPage("HOME");
  const settings = await getSiteSettings();
  return pageMetadata({
    title: page?.seoTitle ?? settings?.defaultSeoTitle ?? null,
    description: page?.seoDescription ?? null,
    path: "/",
  });
}

export default async function HomePage() {
  const page = await getPublishedPage("HOME");
  if (!page) {
    // Until the Home page is published, show a quiet holding page rather
    // than draft content.
    const settings = await getSiteSettings();
    return (
      <section
        className="site-holding site-container"
        aria-labelledby="holding-title"
      >
        <h1 id="holding-title">{settings?.siteName ?? "Rivana Residence"}</h1>
        <p>
          Our new website is being prepared. Please contact us directly in the
          meantime.
        </p>
      </section>
    );
  }
  return <ManagedPageSections page={page} />;
}
