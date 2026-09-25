import Link from "next/link";

import type { PublicSettings } from "@/application/public/view-models";
import { BookNowButton } from "@/presentation/site/book-now-button";
import { BrandLogo } from "@/presentation/site/brand-logo";
import { HeaderState } from "@/presentation/site/header-state";
import { Icon } from "@/presentation/site/icons";
import { MobileMenu } from "@/presentation/site/mobile-menu";
import { SiteNavLinks } from "@/presentation/site/site-nav-links";

export function SiteHeader({
  settings,
  bookingMessage,
}: Readonly<{ settings: PublicSettings | null; bookingMessage: string }>) {
  return (
    <header className="site-header">
      <HeaderState />
      <span className="site-header__progress" aria-hidden="true" />
      <div className="site-header__inner site-container">
        <Link href="/" className="site-header__brand">
          <BrandLogo tone="inverse" className="site-logo site-logo--inverse" />
          <BrandLogo tone="default" className="site-logo site-logo--default" />
          <span className="sr-only">
            {settings?.siteName ?? "Rivana Residence"} home
          </span>
        </Link>
        <nav aria-label="Main" className="site-nav">
          <SiteNavLinks className="site-nav__links" />
        </nav>
        <div className="site-header__actions">
          <BookNowButton message={bookingMessage} />
          <MobileMenu>
            <nav aria-label="Main (menu)">
              <SiteNavLinks className="site-menu__links" numbered />
            </nav>
            {settings && (settings.phone || settings.email) ? (
              <address className="site-menu__contact">
                {settings.phone ? (
                  <a href={`tel:${settings.phone.replace(/[^+0-9]/g, "")}`}>
                    <Icon name="phone" />
                    {settings.phone}
                  </a>
                ) : null}
                {settings.email ? (
                  <a href={`mailto:${settings.email}`}>
                    <Icon name="mail" />
                    {settings.email}
                  </a>
                ) : null}
              </address>
            ) : null}
          </MobileMenu>
        </div>
      </div>
    </header>
  );
}
