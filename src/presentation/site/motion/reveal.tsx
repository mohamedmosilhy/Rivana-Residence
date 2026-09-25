"use client";

import { m, useReducedMotion, type Variants } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export const EASE_OUT_SOFT = [0.23, 1, 0.32, 1] as const;

// Elements whose top edge starts below this share of the viewport wait for
// the visitor to scroll to them; anything already on screen at hydration
// stays exactly as the server rendered it, so nothing ever flashes away.
const FOLD = 0.9;

type RevealState = "hidden" | "shown";

/**
 * Server-rendered content is always visible. After hydration, an element
 * that is still below the fold is hidden and revealed once, when it scrolls
 * into view. Without JavaScript, without IntersectionObserver, or with
 * reduced motion requested, nothing is ever hidden.
 */
export function useReveal<T extends Element>() {
  const ref = useRef<T>(null);
  const reduce = useReducedMotion();
  const [state, setState] = useState<RevealState | "static">("static");

  useEffect(() => {
    const node = ref.current;
    if (reduce || !node || typeof IntersectionObserver === "undefined") return;
    if (node.getBoundingClientRect().top <= window.innerHeight * FOLD) return;
    setState("hidden");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState("shown");
          observer.disconnect();
        }
      },
      { rootMargin: `0px 0px -${Math.round((1 - FOLD) * 100)}% 0px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduce]);

  // "static" renders as "shown" with no animation (initial={false}).
  return {
    ref,
    state: state === "hidden" ? "hidden" : "shown",
    armed: state !== "static",
  } as const;
}

const instantly = { duration: 0 } as const;

const ITEM: Variants = {
  hidden: { opacity: 0, y: 36, transition: instantly },
  shown: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: EASE_OUT_SOFT },
  },
};

const FADE: Variants = {
  hidden: { opacity: 0, transition: instantly },
  shown: { opacity: 1, transition: { duration: 0.9, ease: "easeOut" } },
};

const CURTAIN_EASE = [0.76, 0, 0.24, 1] as const;

const CURTAIN: Variants = {
  hidden: { scaleY: 1, transition: instantly },
  shown: { scaleY: 0, transition: { duration: 1.1, ease: CURTAIN_EASE } },
};

function delayed(variants: Variants, delay: number): Variants {
  if (!delay) return variants;
  const shown = variants.shown as { transition?: object };
  return {
    ...variants,
    shown: { ...shown, transition: { ...shown.transition, delay } },
  };
}

type Tag =
  | "div"
  | "section"
  | "header"
  | "ul"
  | "ol"
  | "li"
  | "article"
  | "dl"
  | "aside"
  | "figure";

type RevealProps = Readonly<{
  children: ReactNode;
  as?: Tag;
  className?: string | undefined;
  id?: string;
  /** Children marked RevealItem animate one after another. */
  stagger?: number;
  delay?: number;
  /** "rise" moves up into place; "fade" only changes opacity. */
  variant?: "rise" | "fade";
  "aria-label"?: string;
  "aria-labelledby"?: string | undefined;
}>;

export function Reveal({
  children,
  as = "div",
  stagger,
  delay = 0,
  variant = "rise",
  ...rest
}: RevealProps) {
  const { ref, state } = useReveal<HTMLElement>();
  const Component = m[as] as typeof m.div;
  const variants: Variants =
    stagger === undefined
      ? delayed(variant === "fade" ? FADE : ITEM, delay)
      : {
          hidden: { transition: instantly },
          shown: {
            transition: { staggerChildren: stagger, delayChildren: delay },
          },
        };
  return (
    <Component
      ref={ref as React.Ref<HTMLDivElement>}
      data-reveal=""
      data-reveal-state={state}
      initial={false}
      animate={state}
      variants={variants}
      {...rest}
    >
      {children}
    </Component>
  );
}

/** One step of a staggered Reveal; renders statically anywhere else. */
export function RevealItem({
  children,
  as = "div",
  className,
  variant = "rise",
}: Readonly<{
  children: ReactNode;
  as?: Tag;
  className?: string;
  variant?: "rise" | "fade";
}>) {
  const Component = m[as] as typeof m.div;
  return (
    <Component
      className={className}
      data-reveal-item=""
      variants={variant === "fade" ? FADE : ITEM}
    >
      {children}
    </Component>
  );
}

/**
 * A photograph uncovered by a plum curtain that lifts away, while the image
 * settles from a slight zoom (the zoom is CSS, keyed on data-reveal-state).
 */
export function RevealImage({
  children,
  className,
  delay = 0,
}: Readonly<{ children: ReactNode; className: string; delay?: number }>) {
  const { ref, state, armed } = useReveal<HTMLDivElement>();
  return (
    <m.div
      ref={ref}
      className={`${className} site-reveal-image`}
      data-reveal=""
      data-reveal-state={state}
      initial={false}
      animate={state}
    >
      {children}
      {armed ? (
        <m.span
          aria-hidden="true"
          className="site-reveal-image__curtain"
          variants={delayed(CURTAIN, delay)}
        />
      ) : null}
    </m.div>
  );
}
