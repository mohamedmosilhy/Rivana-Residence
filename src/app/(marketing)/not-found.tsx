import Link from "next/link";

import { PageHero } from "@/presentation/site/heroes";

export default function MarketingNotFound() {
  return (
    <PageHero
      size="screen"
      eyebrow="404"
      title="This page could not be found"
      titleId="not-found-title"
      intro="It may have moved or is not available yet."
    >
      <Link href="/" className="site-button">
        Go to the home page
      </Link>
      <Link href="/rooms" className="site-button site-button--ghost">
        View the rooms
      </Link>
    </PageHero>
  );
}
