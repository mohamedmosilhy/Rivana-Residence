import type { Route } from "next";
import Link from "next/link";

import type { PublicBranch } from "@/application/public/view-models";
import { Icon } from "@/presentation/site/icons";
import { SiteImage } from "@/presentation/site/site-image";
import {
  container,
  lightSection,
  sectionHeading,
} from "@/presentation/site/classes";

const CARD_LINK =
  "after:absolute after:inset-0 after:z-1 after:content-[''] focus-visible:[outline:none]";

/**
 * One card per active branch (ADR 026, spec 0002): name, city, summary,
 * and the branch hero when it has one. Each card opens that branch's site.
 */
export function BranchChooser({
  branches,
}: Readonly<{ branches: readonly PublicBranch[] }>) {
  return (
    <section
      data-light-section=""
      className={`${lightSection} ${container}`}
      aria-labelledby="branch-chooser"
    >
      <h2 id="branch-chooser" className={sectionHeading}>
        Choose a residence
      </h2>
      <ul className="m-0 mt-10 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-10 p-0">
        {branches.map((branch) => (
          <li key={branch.slug}>
            <article
              data-branch-card={branch.slug}
              className="group/card relative grid content-start gap-5 focus-within:[outline:3px_solid_var(--color-focus)] focus-within:[outline-offset:6px]"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-plum-100">
                {branch.hero ? (
                  <SiteImage
                    image={branch.hero}
                    fill
                    decorative
                    className="[transition:transform_var(--motion-image)_var(--ease-out-soft)] can-hover:group-hover/card:[transform:scale(1.03)]"
                    sizes="(min-width: 64rem) 45vw, 100vw"
                  />
                ) : null}
              </div>
              <div className="grid justify-items-start gap-2">
                {branch.city ? (
                  <p className="m-0 text-[0.75rem] font-medium tracking-[0.22em] text-gold-600 uppercase">
                    {branch.city}
                  </p>
                ) : null}
                <h3 className="m-0 font-display text-heading-lg leading-[1.15] font-normal text-plum-900">
                  <Link href={`/${branch.slug}` as Route} className={CARD_LINK}>
                    {branch.name}
                  </Link>
                </h3>
                {branch.summary ? (
                  <p className="m-0 max-w-[44ch] text-neutral-600">
                    {branch.summary}
                  </p>
                ) : null}
                <span
                  className="mt-2 inline-flex items-center gap-3 text-[0.75rem] font-medium tracking-[0.22em] text-plum-800 uppercase"
                  aria-hidden="true"
                >
                  Visit
                  <Icon name="arrow" className="size-[1.125rem] flex-none" />
                </span>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
