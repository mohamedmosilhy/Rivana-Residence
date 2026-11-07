"use client";

import type { Route } from "next";
import Link from "next/link";
import { useParams } from "next/navigation";

import { PageHero } from "@/presentation/site/heroes";
import { actionFill, button } from "@/presentation/site/classes";

// Inside an active branch (an unknown path, listing, or facility): the
// branch shell stays, and the links stay in the branch.
export default function BranchNotFound() {
  const { branch } = useParams<{ branch: string }>();
  return (
    <PageHero
      size="screen"
      eyebrow="404"
      title="This page could not be found"
      titleId="not-found-title"
      intro="It may have moved or is not available yet."
    >
      <Link
        href={`/${branch}` as Route}
        className={button("primary-dark", actionFill)}
      >
        Go to the home page
      </Link>
      <Link
        href={`/${branch}/stay` as Route}
        className={button("ghost-dark", actionFill)}
      >
        View where to stay
      </Link>
    </PageHero>
  );
}
