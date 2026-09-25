"use client";

import { m, useReducedMotion, useScroll, useTransform } from "motion/react";
import type { ReactNode } from "react";

// Scroll-linked depth for full-bleed heroes. The page scrolls normally; these
// layers only change transform/opacity in response, so nothing is hijacked
// and no layout is recalculated. With reduced motion they are static.

/** The hero photograph drifts down at a fraction of the scroll speed. */
export function ParallaxLayer({
  children,
  className,
  speed = 0.3,
}: Readonly<{ children: ReactNode; className: string; speed?: number }>) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, (value) => Math.min(value, 1200) * speed);
  return (
    <m.div className={className} style={reduce ? {} : { y }}>
      {children}
    </m.div>
  );
}

/** The hero text eases up and fades as the hero leaves the screen. */
export function ScrollFade({
  children,
  className,
}: Readonly<{ children: ReactNode; className: string }>) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 700], [1, 0.1]);
  const y = useTransform(scrollY, [0, 700], [0, -90]);
  return (
    <m.div className={className} style={reduce ? {} : { opacity, y }}>
      {children}
    </m.div>
  );
}
