import type { Route } from "next";
import Link from "next/link";

import type {
  PublicBranch,
  PublicSettings,
} from "@/application/public/view-models";
import { stayLabel } from "@/domain/catalog";
import { BrandLogo } from "@/presentation/site/brand-logo";
import { Icon } from "@/presentation/site/icons";
import { SunRays } from "@/presentation/site/ornaments";
import { siteLinks } from "@/presentation/site/site-links";
import { container, linkIcon, linkInverse } from "@/presentation/site/classes";

const HEADING =
  "mt-0 mb-5 text-[0.75rem] font-medium tracking-[0.24em] text-gold-400 uppercase";
const LIST = "m-0 grid gap-1 p-0";
const LINK =
  "text-inverse-strong hover:text-surface hover:[text-decoration:underline] hover:underline-offset-[0.3em]";
const LIST_LINK = `inline-flex min-h-9 items-center ${LINK}`;
const CONTACT = "grid gap-2 not-italic [overflow-wrap:anywhere]";

/**
 * Brand, tagline, social links, and legal text (settings), plus the
 * branch's links, address, and contact on branch pages (spec 0002). The
 * chooser and top-level 404 show the brand only.
 */
export function SiteFooter({
  settings,
  branch = null,
}: Readonly<{
  settings: PublicSettings | null;
  branch?: PublicBranch | null;
}>) {
  const siteName = settings?.siteName ?? "Rivana Residence";
  return (
    <footer
      data-dark-surface=""
      className="relative isolate overflow-hidden bg-plum-950 text-inverse-body"
    >
      <SunRays className="absolute top-[clamp(-18rem,-20vw,-8rem)] left-1/2 -z-1 w-[clamp(30rem,64vw,60rem)] -translate-x-1/2 text-gold-400 opacity-7" />
      <div
        className={`${container} grid justify-items-center gap-6 border-b border-inverse-line-subtle pt-[clamp(4.5rem,9vw,7rem)] pb-[clamp(3rem,6vw,4.5rem)] text-center`}
      >
        <BrandLogo
          tone="inverse"
          className="block h-28 w-auto max-md:h-22"
          alt={siteName}
        />
        {settings?.tagline ? (
          <p className="m-0 max-w-[22ch] font-display text-display-md leading-[1.12] text-balance text-surface">
            {settings.tagline}
          </p>
        ) : null}
        {branch ? (
          <Link
            href={`/${branch.slug}/contact` as Route}
            className={`${linkInverse} hover:[text-decoration:underline] hover:underline-offset-[0.3em]`}
          >
            Plan your stay
            <Icon name="arrow" className={linkIcon} />
          </Link>
        ) : null}
      </div>
      <div
        className={`${container} grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-10 py-16`}
      >
        {branch ? (
          <nav aria-labelledby="footer-explore">
            <h2 id="footer-explore" className={HEADING}>
              Explore
            </h2>
            <ul className={LIST}>
              {siteLinks(
                branch.slug,
                stayLabel(branch.stayTypes),
                branch.hasFacilities,
              ).map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={LIST_LINK}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        {branch && branch.addressLines.length > 0 ? (
          <div>
            <h2 className={HEADING}>Visit</h2>
            <address className={CONTACT}>
              {branch.addressLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </address>
          </div>
        ) : null}
        {branch && (branch.phone || branch.email) ? (
          <div>
            <h2 className={HEADING}>Contact</h2>
            <address className={CONTACT}>
              {branch.phone ? (
                <a
                  href={`tel:${branch.phone.replace(/[^+0-9]/g, "")}`}
                  className={LINK}
                >
                  {branch.phone}
                </a>
              ) : null}
              {branch.email ? (
                <a href={`mailto:${branch.email}`} className={LINK}>
                  {branch.email}
                </a>
              ) : null}
            </address>
          </div>
        ) : null}
        {settings && settings.socialLinks.length > 0 ? (
          <div>
            <h2 id="footer-social" className={HEADING}>
              Follow
            </h2>
            <ul aria-labelledby="footer-social" className={LIST}>
              {settings.socialLinks.map((link) => (
                <li key={link.platform}>
                  <a
                    href={link.url}
                    rel="noopener noreferrer"
                    target="_blank"
                    aria-label={`${link.label} (opens in a new tab)`}
                    className={LIST_LINK}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div
        className={`${container} border-t border-inverse-line-subtle py-6 text-[0.8125rem] text-inverse-muted`}
      >
        <p className="m-0">{settings?.footerText ?? `© ${siteName}`}</p>
      </div>
    </footer>
  );
}
