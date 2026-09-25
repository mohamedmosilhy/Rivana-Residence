"use client";

import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

const loadFeatures = () =>
  import("@/presentation/site/motion/motion-features").then(
    (module) => module.default,
  );

// One motion runtime for the public site. LazyMotion keeps the bundle to the
// DOM-animation feature set (no drag or layout projection), fetched after
// the page is interactive, and "user" makes every Motion animation drop its
// transforms when the visitor asks the operating system for reduced motion.
export function MotionProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
