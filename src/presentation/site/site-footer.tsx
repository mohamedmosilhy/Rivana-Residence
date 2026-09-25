import Link from "next/link";

import type { PublicSettings } from "@/application/public/view-models";
import { SITE_LINKS } from "@/presentation/site/site-links";
import { BrandMark } from "@/presentation/design/brand-mark";

export function SiteFooter({
  settings,
}: Readonly<{ settings: PublicSettings | null }>) {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner site-container">
        <div className="site-footer__brand">
          <BrandMark />
          {settings?.tagline ? <p>{settings.tagline}</p> : null}
        </div>
        <nav aria-label="Footer" className="site-footer__nav">
          <ul>
            {SITE_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        {settings ? (
          <address className="site-footer__contact">
            {settings.addressLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
            {settings.phone ? (
              <a href={`tel:${settings.phone.replace(/[^+0-9]/g, "")}`}>
                {settings.phone}
              </a>
            ) : null}
            {settings.email ? (
              <a href={`mailto:${settings.email}`}>{settings.email}</a>
            ) : null}
          </address>
        ) : null}
        {settings && settings.socialLinks.length > 0 ? (
          <ul className="site-footer__social" aria-label="Social media">
            {settings.socialLinks.map((link) => (
              <li key={link.platform}>
                <a
                  href={link.url}
                  rel="noopener noreferrer"
                  target="_blank"
                  aria-label={`${link.label} (opens in a new tab)`}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="site-footer__legal site-container">
        <p>
          {settings?.footerText ??
            `© ${settings?.siteName ?? "Rivana Residence"}`}
        </p>
      </div>
    </footer>
  );
}
