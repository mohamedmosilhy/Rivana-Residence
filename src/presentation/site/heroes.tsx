import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import type { PublicImage } from "@/application/public/view-models";
import { ParallaxLayer } from "@/presentation/site/motion/hero-scroll";
import { SharedElement } from "@/presentation/site/motion/shared-element";
import { BrushEdge, SunRays } from "@/presentation/site/ornaments";
import { SiteImage } from "@/presentation/site/site-image";

// Photos narrower than this are shown beside the title at their natural
// size instead of being stretched across the screen.
const FULL_BLEED_MIN_WIDTH = 1400;

/** A typographic plum header for pages without managed hero imagery. */
export function PageHero({
  eyebrow,
  title,
  titleId,
  intro,
  children,
  size = "page",
}: Readonly<{
  eyebrow?: string;
  title: string;
  titleId?: string;
  intro?: string;
  children?: ReactNode;
  /** "screen" fills the viewport (holding and not-found pages). */
  size?: "page" | "screen";
}>) {
  return (
    <header className={`site-page-hero site-page-hero--${size}`}>
      <SunRays className="site-page-hero__rays" />
      <div className="site-page-hero__content site-container">
        {eyebrow ? <p className="site-eyebrow">{eyebrow}</p> : null}
        <h1 id={titleId}>{title}</h1>
        {intro ? <p className="site-page-hero__intro">{intro}</p> : null}
        {children ? <div className="site-actions">{children}</div> : null}
      </div>
      <BrushEdge className="site-edge" />
    </header>
  );
}

/** The opening of a room or facility page, with its breadcrumb. */
export function DetailHero({
  parent,
  title,
  lede,
  image,
  morphName,
  children,
}: Readonly<{
  parent: Readonly<{ href: Route; label: string }>;
  title: string;
  lede: string;
  image: PublicImage | null;
  /** Shared with the listing card's photo, so navigating morphs it here. */
  morphName: string;
  children?: ReactNode;
}>) {
  const wide = image !== null && image.width >= FULL_BLEED_MIN_WIDTH;
  return (
    <header
      className={`site-detail-hero site-detail-hero--${wide ? "wide" : "split"}`}
    >
      {wide ? (
        <SharedElement name={morphName}>
          <div className="site-detail-hero__backdrop">
            <ParallaxLayer className="site-hero__parallax">
              <SiteImage image={image} fill preload sizes="100vw" />
            </ParallaxLayer>
          </div>
        </SharedElement>
      ) : (
        <SunRays className="site-page-hero__rays" />
      )}
      <div className="site-detail-hero__inner site-container">
        <div className="site-detail-hero__text">
          <nav aria-label="Breadcrumb" className="site-breadcrumb">
            <ol>
              <li>
                <Link href={parent.href}>{parent.label}</Link>
              </li>
              <li>
                <span aria-current="page">{title}</span>
              </li>
            </ol>
          </nav>
          <h1>{title}</h1>
          <p className="site-detail-hero__lede">{lede}</p>
          {children ? <div className="site-actions">{children}</div> : null}
        </div>
        {!wide && image ? (
          <SharedElement name={morphName}>
            <div className="site-detail-hero__media">
              <SiteImage
                image={image}
                preload
                sizes="(min-width: 64rem) 40rem, 100vw"
              />
            </div>
          </SharedElement>
        ) : null}
      </div>
      <BrushEdge className="site-edge" />
    </header>
  );
}
