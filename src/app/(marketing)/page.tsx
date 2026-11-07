import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";

import { getActiveBranches, getSiteSettings } from "@/composition/public";
import { BranchChooser } from "@/presentation/site/branch-chooser";
import { PageHero } from "@/presentation/site/heroes";
import { SiteFooter } from "@/presentation/site/site-footer";
import { SiteHeader } from "@/presentation/site/site-header";
import { SiteShell } from "@/presentation/site/site-shell";

import { bookingMessage, pageMetadata } from "./site-content";

export async function generateMetadata(): Promise<Metadata> {
  const [settings, branches] = await Promise.all([
    getSiteSettings(),
    getActiveBranches(),
  ]);
  const metadata = await pageMetadata({
    title: settings?.defaultSeoTitle ?? null,
    description: null,
    path: "/",
    absoluteTitle: true,
  });
  // The holding page (no active branch) is not for search engines.
  return branches.length === 0
    ? { ...metadata, robots: { index: false, follow: false } }
    : metadata;
}

/**
 * The first screen (ADR 026, spec 0002): the branch chooser with two or
 * more active branches, a temporary redirect to the only one, or a neutral
 * holding message when none is active.
 */
export default async function SiteRoot() {
  const branches = await getActiveBranches();
  if (branches.length === 1) redirect(`/${branches[0]!.slug}` as Route);

  const [settings, message] = await Promise.all([
    getSiteSettings(),
    bookingMessage(),
  ]);
  const siteName = settings?.siteName ?? "Rivana Residence";
  return (
    <SiteShell
      header={<SiteHeader settings={settings} bookingMessage={message} />}
      footer={<SiteFooter settings={settings} />}
    >
      {branches.length === 0 ? (
        <PageHero
          size="screen"
          title={siteName}
          titleId="holding-title"
          intro="Our new website is being prepared. Please check back soon."
        />
      ) : (
        <>
          <PageHero
            eyebrow="Welcome"
            title={siteName}
            titleId="chooser-title"
            intro={
              settings?.tagline ??
              "Choose the residence you would like to visit."
            }
          />
          <BranchChooser branches={branches} />
        </>
      )}
    </SiteShell>
  );
}
