import Link from "next/link";

import { PageHero } from "@/presentation/site/heroes";
import { actionFill, button } from "@/presentation/site/classes";

export default function MarketingNotFound() {
  return (
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
      <Link href="/rooms" className={button("ghost-dark", actionFill)}>
        View the rooms
      </Link>
    </PageHero>
  );
}
