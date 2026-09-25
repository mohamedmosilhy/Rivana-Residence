import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublishedPage, getSiteSettings } from "@/composition/public";
import { Icon } from "@/presentation/site/icons";
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
          <div className="site-contact__info">
            <p className="site-eyebrow">Find us</p>
            <h2 id="contact-details">Visit Rivana Residence</h2>
            <ul className="site-contact__list">
              {settings.addressLines.length > 0 ? (
                <li>
                  <Icon name="pin" />
                  <div>
                    <h3>Address</h3>
                    <address>
                      {settings.addressLines.map((line) => (
                        <span key={line}>{line}</span>
                      ))}
                    </address>
                  </div>
                </li>
              ) : null}
              {settings.phone ? (
                <li>
                  <Icon name="phone" />
                  <div>
                    <h3>Phone</h3>
                    <a href={`tel:${settings.phone.replace(/[^+0-9]/g, "")}`}>
                      {settings.phone}
                    </a>
                  </div>
                </li>
              ) : null}
              {settings.email ? (
                <li>
                  <Icon name="mail" />
                  <div>
                    <h3>Email</h3>
                    <a href={`mailto:${settings.email}`}>{settings.email}</a>
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
