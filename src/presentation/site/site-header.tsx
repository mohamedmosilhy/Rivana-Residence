import Link from "next/link";

import type { PublicSettings } from "@/application/public/view-models";
import { BookNowButton } from "@/presentation/site/book-now-button";
import { BrandLogo } from "@/presentation/site/brand-logo";
import { container } from "@/presentation/site/classes";
import { HeaderState } from "@/presentation/site/header-state";
import { Icon } from "@/presentation/site/icons";
import { MobileMenu } from "@/presentation/site/mobile-menu";
import { SiteNavLinks } from "@/presentation/site/site-nav-links";

// Transparent over the opening hero; HeaderState marks it enhanced (fixed),
// scrolled (light surface), and tucked (hidden while reading down).
const HEADER =
  "absolute top-0 right-0 left-0 z-40 text-surface [transition:background-color_var(--motion-surface)_ease,box-shadow_var(--motion-surface)_ease,color_var(--motion-surface)_ease] before:pointer-events-none before:absolute before:inset-[0_0_-2.5rem] before:bg-[linear-gradient(to_bottom,rgb(26_11_20/0.5),transparent)] before:[transition:opacity_var(--motion-surface)_ease] data-[enhanced=true]:fixed data-[enhanced=true]:[view-transition-name:site-header] data-[enhanced=true]:[transition:background-color_var(--motion-surface)_ease,box-shadow_var(--motion-surface)_ease,color_var(--motion-surface)_ease,transform_520ms_var(--ease-out-soft)] data-[scrolled=true]:bg-header-surface data-[scrolled=true]:text-neutral-950 data-[scrolled=true]:shadow-[0_1px_0_rgb(31_27_29/0.08)] data-[scrolled=true]:[backdrop-filter:saturate(1.4)_blur(14px)] data-[scrolled=true]:before:opacity-0 has-[[data-site-menu][open]]:bg-transparent has-[[data-site-menu][open]]:text-surface has-[[data-site-menu][open]]:shadow-none has-[[data-site-menu][open]]:[backdrop-filter:none] motion-safe:data-[tucked=true]:not-focus-within:not-has-[[data-site-menu][open]]:[transform:translateY(-100%)]";

const LOGO =
  "[grid-area:1/1] h-[4.25rem] w-auto [transition:opacity_var(--motion-surface)_ease,height_var(--motion-surface)_ease] max-md:h-14 header-scrolled:h-[3.25rem] header-scrolled:max-md:h-[2.875rem]";

export function SiteHeader({
  settings,
  bookingMessage,
}: Readonly<{ settings: PublicSettings | null; bookingMessage: string }>) {
  return (
    <header data-site-header="" className={HEADER}>
      <HeaderState />
      <span
        className="pointer-events-none absolute right-0 bottom-0 left-0 h-0.5 origin-left bg-gold-400 opacity-0 [transform:scaleX(var(--scroll-progress,0))] [transition:opacity_var(--motion-surface)_ease] [[data-site-header][data-scrolled=true]:not(:has([data-site-menu][open]))_&]:opacity-100"
        aria-hidden="true"
      />
      <div
        className={`${container} relative flex min-h-(--header-height) items-center justify-between gap-4 [transition:min-height_var(--motion-surface)_ease] lg:grid lg:grid-cols-[1fr_auto_1fr] header-scrolled:min-h-(--header-height-compact)`}
      >
        <Link href="/" className="grid flex-none">
          <BrandLogo
            tone="inverse"
            className={`${LOGO} header-scrolled:opacity-0 header-menu-open:opacity-100`}
            eager
          />
          <BrandLogo
            tone="default"
            className={`${LOGO} opacity-0 header-scrolled:opacity-100 header-menu-open:opacity-0`}
            eager
          />
          <span className="visually-hidden">
            {settings?.siteName ?? "Rivana Residence"} home
          </span>
        </Link>
        <nav aria-label="Main" className="max-lg:hidden">
          <SiteNavLinks variant="bar" />
        </nav>
        <div className="flex items-center gap-3 lg:justify-self-end">
          <BookNowButton message={bookingMessage} placement="header" />
          <MobileMenu>
            <nav aria-label="Main (menu)">
              <SiteNavLinks variant="menu" />
            </nav>
            {settings && (settings.phone || settings.email) ? (
              <address className="grid gap-2 not-italic menu-open:animate-[site-fade_600ms_ease-out_520ms_both] menu-closing:animate-[site-fade-out_180ms_ease-in_both]">
                {settings.phone ? (
                  <a
                    href={`tel:${settings.phone.replace(/[^+0-9]/g, "")}`}
                    className={MENU_CONTACT}
                  >
                    <Icon name="phone" className={MENU_CONTACT_ICON} />
                    {settings.phone}
                  </a>
                ) : null}
                {settings.email ? (
                  <a href={`mailto:${settings.email}`} className={MENU_CONTACT}>
                    <Icon name="mail" className={MENU_CONTACT_ICON} />
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

const MENU_CONTACT =
  "inline-flex min-h-11 items-center gap-3 text-inverse-strong";
const MENU_CONTACT_ICON = "size-5 flex-none text-gold-400";
