import Link from "next/link";

import { getSiteSettings } from "@/composition/public";
import { PageHero } from "@/presentation/site/heroes";
import { SiteFooter } from "@/presentation/site/site-footer";
import { SiteHeader } from "@/presentation/site/site-header";
import { SiteShell } from "@/presentation/site/site-shell";
import { actionFill, button } from "@/presentation/site/classes";

import { bookingMessage } from "./site-content";

// No branch here (an unknown or inactive branch): the brand-only shell.
export default async function MarketingNotFound() {
  const [settings, message] = await Promise.all([
    getSiteSettings(),
    bookingMessage(),
  ]);
  return (
    <SiteShell
      header={<SiteHeader settings={settings} bookingMessage={message} />}
      footer={<SiteFooter settings={settings} />}
    >
      <PageHero
        size="screen"
        eyebrow="404"
        title="This page could not be found"
        titleId="not-found-title"
        intro="It may have moved or is not available yet."
      >
        <Link href="/" className={button("primary-dark", actionFill)}>
          Go to the home page
        </Link>
      </PageHero>
    </SiteShell>
  );
}
