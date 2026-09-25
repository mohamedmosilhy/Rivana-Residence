import Link from "next/link";

import type { PublicSettings } from "@/application/public/view-models";
import { BookNowButton } from "@/presentation/site/book-now-button";
import { MobileMenu } from "@/presentation/site/mobile-menu";
import { SiteNavLinks } from "@/presentation/site/site-nav-links";
import { BrandMark } from "@/presentation/design/brand-mark";

export function SiteHeader({
  settings,
  bookingMessage,
}: Readonly<{ settings: PublicSettings | null; bookingMessage: string }>) {
  return (
    <header className="site-header">
      <div className="site-header__inner site-container">
        <Link href="/" className="site-header__brand">
          <BrandMark />
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
              <SiteNavLinks className="site-menu__links" />
            </nav>
          </MobileMenu>
        </div>
      </div>
    </header>
  );
}
