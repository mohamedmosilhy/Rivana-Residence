import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublishedPage, getSiteSettings } from "@/composition/public";
import { LocationMap } from "@/presentation/site/location-map";

import { ManagedPageSections, pageMetadata } from "../site-content";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublishedPage("CONTACT");
  return pageMetadata({
    title: page?.seoTitle ?? page?.title ?? "Contact",
    description: page?.seoDescription ?? null,
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
          className="site-section site-container site-contact"
          aria-labelledby="contact-details"
        >
          <div>
            <h2 id="contact-details">Find us</h2>
            <address className="site-contact__details">
              {settings.addressLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
              {settings.phone ? (
                <span>
                  Phone:{" "}
                  <a href={`tel:${settings.phone.replace(/[^+0-9]/g, "")}`}>
                    {settings.phone}
                  </a>
                </span>
              ) : null}
              {settings.email ? (
                <span>
                  Email:{" "}
                  <a href={`mailto:${settings.email}`}>{settings.email}</a>
                </span>
              ) : null}
            </address>
          </div>
          <LocationMap settings={settings} />
        </section>
      ) : null}
      <ManagedPageSections page={{ ...page, sections: rest }} startIndex={1} />
    </>
  );
}
