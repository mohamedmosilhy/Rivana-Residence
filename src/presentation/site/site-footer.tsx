import Link from "next/link";

import type { PublicSettings } from "@/application/public/view-models";
import { BrandLogo } from "@/presentation/site/brand-logo";
import { Icon } from "@/presentation/site/icons";
import { SunRays } from "@/presentation/site/ornaments";
import { SITE_LINKS } from "@/presentation/site/site-links";

export function SiteFooter({
  settings,
}: Readonly<{ settings: PublicSettings | null }>) {
  const siteName = settings?.siteName ?? "Rivana Residence";
  return (
    <footer className="site-footer">
      <SunRays className="site-footer__rays" />
      <div className="site-footer__lead site-container">
        <BrandLogo
          tone="inverse"
          className="site-footer__logo"
          alt={siteName}
        />
        {settings?.tagline ? (
          <p className="site-footer__tagline">{settings.tagline}</p>
        ) : null}
        <Link href="/contact" className="site-link site-link--inverse">
          Plan your stay
          <Icon name="arrow" />
        </Link>
      </div>
      <div className="site-footer__inner site-container">
        <nav aria-labelledby="footer-explore" className="site-footer__column">
          <h2 id="footer-explore" className="site-footer__heading">
            Explore
          </h2>
          <ul>
            {SITE_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        {settings && settings.addressLines.length > 0 ? (
          <div className="site-footer__column">
            <h2 className="site-footer__heading">Visit</h2>
            <address className="site-footer__contact">
              {settings.addressLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </address>
          </div>
        ) : null}
        {settings && (settings.phone || settings.email) ? (
          <div className="site-footer__column">
            <h2 className="site-footer__heading">Contact</h2>
            <address className="site-footer__contact">
              {settings.phone ? (
                <a href={`tel:${settings.phone.replace(/[^+0-9]/g, "")}`}>
                  {settings.phone}
                </a>
              ) : null}
              {settings.email ? (
                <a href={`mailto:${settings.email}`}>{settings.email}</a>
              ) : null}
            </address>
          </div>
        ) : null}
        {settings && settings.socialLinks.length > 0 ? (
          <div className="site-footer__column">
            <h2 id="footer-social" className="site-footer__heading">
              Follow
            </h2>
            <ul aria-labelledby="footer-social">
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
          </div>
        ) : null}
      </div>
      <div className="site-footer__legal site-container">
        <p>{settings?.footerText ?? `© ${siteName}`}</p>
      </div>
    </footer>
  );
}
