import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublishedPage, getSiteSettings } from "@/composition/public";
import { Icon } from "@/presentation/site/icons";
import { LocationMap } from "@/presentation/site/location-map";

import { ManagedPageSections, pageMetadata } from "../site-content";
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

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublishedPage("CONTACT");
  return pageMetadata({
    title: page?.seoTitle ?? page?.title ?? "Contact",
    description: page?.seoDescription ?? null,
    image: page?.socialImage,
    path: "/contact",
  });
}

export default async function ContactPage() {
  const [page, settings] = await Promise.all([
    getPublishedPage("CONTACT"),
    getSiteSettings(),
  ]);
  if (!page) notFound();
  const [first, ...rest] = page.sections;
  return (
    <>
      {first ? (
        <ManagedPageSections page={{ ...page, sections: [first] }} />
      ) : null}
      {settings ? (
        <section
          data-light-section=""
          className={`${lightSection} ${container} grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start gap-[clamp(2.5rem,7vw,7rem)] max-lg:grid-cols-[minmax(0,1fr)]`}
          aria-labelledby="contact-details"
        >
          <div>
            <p className={eyebrow}>Find us</p>
            <h2 id="contact-details" className={sectionHeading}>
              Visit Rivana Residence
            </h2>
            <ul className="mt-10 grid p-0">
              {settings.addressLines.length > 0 ? (
                <li className={ITEM}>
                  <Icon name="pin" className={ITEM_ICON} />
                  <div>
                    <h3 className={ITEM_LABEL}>Address</h3>
                    <address className="grid text-[1.0625rem] text-neutral-950 not-italic [overflow-wrap:anywhere]">
                      {settings.addressLines.map((line) => (
                        <span key={line}>{line}</span>
                      ))}
                    </address>
                  </div>
                </li>
              ) : null}
              {settings.phone ? (
                <li className={ITEM}>
                  <Icon name="phone" className={ITEM_ICON} />
                  <div>
                    <h3 className={ITEM_LABEL}>Phone</h3>
                    <a
                      className={ITEM_LINK}
                      href={`tel:${settings.phone.replace(/[^+0-9]/g, "")}`}
                    >
                      {settings.phone}
                    </a>
                  </div>
                </li>
              ) : null}
              {settings.email ? (
                <li className={ITEM}>
                  <Icon name="mail" className={ITEM_ICON} />
                  <div>
                    <h3 className={ITEM_LABEL}>Email</h3>
                    <a className={ITEM_LINK} href={`mailto:${settings.email}`}>
                      {settings.email}
                    </a>
                  </div>
                </li>
              ) : null}
            </ul>
          </div>
          <LocationMap settings={settings} />
        </section>
      ) : null}
      <ManagedPageSections page={{ ...page, sections: rest }} startIndex={1} />
    </>
  );
}
