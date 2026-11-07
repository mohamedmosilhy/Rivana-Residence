import type { Route } from "next";
import Link from "next/link";

import type { PublicBranch } from "@/application/public/view-models";
import { LocationMap } from "@/presentation/site/location-map";
import {
  container,
  eyebrow,
  lightSection,
  link,
  linkIcon,
  sectionHeading,
} from "@/presentation/site/classes";
import { Icon } from "@/presentation/site/icons";

/**
 * The location block on a branch home (Q-52, spec 0002): the address and
 * the branch's interactive map, with the directions link as the fallback.
 * A fixed template block, not a page section.
 */
export function BranchLocation({ branch }: Readonly<{ branch: PublicBranch }>) {
  if (!branch.mapEmbedUrl && branch.addressLines.length === 0) return null;
  return (
    <section
      data-light-section=""
      className={`${lightSection} ${container} grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start gap-[clamp(2.5rem,7vw,7rem)] max-lg:grid-cols-[minmax(0,1fr)]`}
      aria-labelledby="branch-location"
    >
      <div>
        <p className={eyebrow}>Location</p>
        <h2 id="branch-location" className={sectionHeading}>
          Find {branch.name}
        </h2>
        {branch.addressLines.length > 0 ? (
          <address className="mt-8 grid text-[1.0625rem] text-neutral-950 not-italic [overflow-wrap:anywhere]">
            {branch.addressLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </address>
        ) : null}
        <p className="mt-8 mb-0">
          <Link href={`/${branch.slug}/contact` as Route} className={link}>
            Contact and directions
            <Icon name="arrow" className={linkIcon} />
          </Link>
        </p>
      </div>
      <LocationMap place={branch} />
    </section>
  );
}
