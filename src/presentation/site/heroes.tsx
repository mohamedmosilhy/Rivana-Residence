import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import type { PublicImage } from "@/application/public/view-models";
import {
  actions,
  brushEdge,
  container,
  eyebrowDark,
  goldFrame,
  heroLede,
  heroRays,
  heroRise,
  heroTitle,
  plumSurface,
} from "@/presentation/site/classes";
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
    <header
      data-dark-surface=""
      className={`relative isolate grid overflow-hidden ${plumSurface} ${
        size === "screen"
          ? "min-h-svh items-center"
          : "min-h-[clamp(26rem,58svh,36rem)] items-end"
      }`}
    >
      <SunRays className={heroRays} motion="draw" />
      <div
        className={`${container} grid justify-items-start pt-[calc(var(--header-height)+3rem)] pb-[clamp(4.5rem,9vw,7rem)] ${heroRise}`}
      >
        {eyebrow ? <p className={eyebrowDark}>{eyebrow}</p> : null}
        <h1 id={titleId} className={heroTitle}>
          {title}
        </h1>
        {intro ? <p className={heroLede}>{intro}</p> : null}
        {children ? <div className={actions}>{children}</div> : null}
      </div>
      <BrushEdge className={brushEdge} />
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
      data-dark-surface=""
      className={`relative isolate grid overflow-hidden ${plumSurface} ${
        wide
          ? "min-h-[clamp(32rem,80svh,50rem)] items-end after:absolute after:inset-0 after:-z-1 after:bg-[linear-gradient(to_bottom,rgb(26_11_20/0.4)_0%,rgb(26_11_20/0.1)_35%,rgb(26_11_20/0.85)_100%),linear-gradient(to_right,rgb(26_11_20/0.45),transparent_65%)] after:content-['']"
          : ""
      }`}
    >
      {wide ? (
        <SharedElement name={morphName}>
          <div className="absolute inset-0 -z-2">
            <ParallaxLayer className="absolute inset-0">
              <SiteImage image={image} fill preload sizes="100vw" />
            </ParallaxLayer>
          </div>
        </SharedElement>
      ) : (
        <SunRays className={heroRays} motion="draw" />
      )}
      <div
        className={`${container} grid items-center gap-[clamp(2.5rem,6vw,5rem)] pt-[calc(var(--header-height)+clamp(2.5rem,6vw,5rem))] pb-[clamp(5rem,10vw,8rem)] ${
          wide
            ? ""
            : "grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] max-lg:grid-cols-[minmax(0,1fr)] max-lg:pb-[clamp(5rem,12vw,7rem)]"
        }`}
      >
        <div className={`grid justify-items-start ${heroRise}`}>
          <nav aria-label="Breadcrumb">
            <ol className="mb-6 flex flex-wrap gap-x-3 gap-y-2 text-[0.75rem] tracking-[0.2em] text-inverse-strong uppercase">
              <li>
                <Link
                  href={parent.href}
                  className="text-gold-400 underline decoration-[rgb(219_175_113/0.5)] underline-offset-[0.4em]"
                >
                  {parent.label}
                </Link>
              </li>
              <li className="before:mr-3 before:text-gold-400 before:content-['/']">
                <span aria-current="page">{title}</span>
              </li>
            </ol>
          </nav>
          <h1 className={heroTitle}>{title}</h1>
          <p className={heroLede}>{lede}</p>
          {children ? <div className={actions}>{children}</div> : null}
        </div>
        {!wide && image ? (
          <SharedElement name={morphName}>
            <div className={`${goldFrame} max-w-[44rem]`}>
              <SiteImage
                image={image}
                preload
                sizes="(min-width: 64rem) 40rem, 100vw"
                className="relative block h-auto w-full"
              />
            </div>
          </SharedElement>
        ) : null}
      </div>
      <BrushEdge className={brushEdge} />
    </header>
  );
}
