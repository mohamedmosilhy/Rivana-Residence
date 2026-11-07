import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { pagePath } from "@/application/public/seo";
import { getPublishedPage } from "@/composition/public";
import { Icon } from "@/presentation/site/icons";
import { LocationMap } from "@/presentation/site/location-map";

import {
  ManagedPageSections,
  managedPageMetadata,
  requireBranch,
  type BranchParams,
} from "../../site-content";
import {
  container,
  eyebrow,
  lightSection,
  sectionHeading,
} from "@/presentation/site/classes";

const ITEM =
  "grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-5 border-t border-neutral-300 py-6 last:border-b last:border-neutral-300";
const ITEM_ICON =
  "size-11 flex-none rounded-[50%] border border-gold-400 p-[0.6875rem] text-gold-600";
const ITEM_LABEL =
  "mt-0 mb-1 text-[0.75rem] font-medium tracking-[0.2em] text-neutral-600 uppercase";
const ITEM_LINK =
  "text-[1.0625rem] text-neutral-950 underline decoration-gold-400 underline-offset-[0.3em] [overflow-wrap:anywhere]";

export async function generateMetadata({
  params,
}: BranchParams): Promise<Metadata> {
  const branch = await requireBranch(params);
  const page = await getPublishedPage(branch, "CONTACT");
  return managedPageMetadata(branch, page, {
    title: page?.title ?? "Contact",
    path: pagePath(branch.slug, "CONTACT"),
  });
}

export default async function ContactPage({ params }: BranchParams) {
  const branch = await requireBranch(params);
  const page = await getPublishedPage(branch, "CONTACT");
  if (!page) notFound();
  const [first, ...rest] = page.sections;
  return (
    <>
      {first ? (
        <ManagedPageSections
          page={{ ...page, sections: [first] }}
          branch={branch}
        />
      ) : null}
      <section
        data-light-section=""
        className={`${lightSection} ${container} grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start gap-[clamp(2.5rem,7vw,7rem)] max-lg:grid-cols-[minmax(0,1fr)]`}
        aria-labelledby="contact-details"
      >
        <div>
          <p className={eyebrow}>Find us</p>
          <h2 id="contact-details" className={sectionHeading}>
            Visit {branch.name}
          </h2>
          <ul className="mt-10 grid p-0">
            {branch.addressLines.length > 0 ? (
              <li className={ITEM}>
                <Icon name="pin" className={ITEM_ICON} />
                <div>
                  <h3 className={ITEM_LABEL}>Address</h3>
                  <address className="grid text-[1.0625rem] text-neutral-950 not-italic [overflow-wrap:anywhere]">
                    {branch.addressLines.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </address>
                </div>
              </li>
            ) : null}
            {branch.phone ? (
              <li className={ITEM}>
                <Icon name="phone" className={ITEM_ICON} />
                <div>
                  <h3 className={ITEM_LABEL}>Phone</h3>
                  <a
                    className={ITEM_LINK}
                    href={`tel:${branch.phone.replace(/[^+0-9]/g, "")}`}
                  >
                    {branch.phone}
                  </a>
                </div>
              </li>
            ) : null}
            {branch.email ? (
              <li className={ITEM}>
                <Icon name="mail" className={ITEM_ICON} />
                <div>
                  <h3 className={ITEM_LABEL}>Email</h3>
                  <a className={ITEM_LINK} href={`mailto:${branch.email}`}>
                    {branch.email}
                  </a>
                </div>
              </li>
            ) : null}
          </ul>
        </div>
        <LocationMap place={branch} />
      </section>
      <ManagedPageSections
        page={{ ...page, sections: rest }}
        branch={branch}
        startIndex={1}
      />
    </>
  );
}
