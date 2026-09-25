# ADR 012 — Motion (Framer Motion) for public-site animation

Status: Accepted for Phase 9

## Context

Phase 9 layers interaction and motion onto the approved Phase 8 visual system. The client asked for "advanced and cool" animation and named GSAP or Framer Motion. The roadmap still requires animation to use transform and opacity only, content that is readable without JavaScript, an equivalent experience under reduced motion, observers that disconnect, and no autoplay, scroll-jacking, or perpetual decorative motion.

## Decision

Use `motion` 13.4.4 (the Framer Motion library, imported from `motion/react`) for the scroll-triggered reveals, staggered groups, scroll-linked hero depth, and the photo viewer's slide transitions. Load it through `LazyMotion` with the `domAnimation` feature set fetched on demand, and wrap the site in `MotionConfig reducedMotion="user"`.

Use CSS keyframes for anything above the fold on first paint: the home title's letter reveal, hero text entrances, the crest's ray drawing, the menu sheet, and button feedback. They play before hydration and always end visible.

Use React's `<ViewTransition>`, which ships with the Next.js App Router, for the card-to-hero photo morph between listing and detail pages. Browsers without the View Transitions API simply navigate.

## Reasoning

- Motion is React-native. Variants, `AnimatePresence`, and motion values fit Server/Client Component composition without imperative timelines or ref bookkeeping.
- `MotionConfig reducedMotion="user"` removes transforms automatically. The reveal hook also skips hiding entirely when reduced motion is requested.
- Scroll-linked values (`useScroll`/`useTransform`) write transforms without React re-renders and without taking over scrolling.
- CSS keeps first-paint motion independent of JavaScript, so no content waits for the bundle.

## Alternatives considered

- **GSAP + ScrollTrigger:** a powerful timeline engine, but imperative. It would need manual cleanup in every effect, and ScrollTrigger's pinning and scrubbing invite the scroll-jacking the roadmap forbids. Its bundle cost is similar.
- **CSS and IntersectionObserver only:** the smallest option (no dependency). But it offers weaker orchestration for staggered groups, presence animations, and scroll-linked values, and falls short of the requested richness.
- **View Transitions for everything:** good for page-level continuity, but it does not cover in-page reveals or gallery state changes.

## Consequences

- Measured on production builds, the per-page gzipped client JavaScript is 185 KB for Phase 8 and 242 KB for Phase 9. Motion's runtime accounts for about 43 KB of the difference. Both builds exceed the aspirational 120 KB budget in [performance.md](../performance.md); Phase 10 owns budget tuning and may replace simple reveals with CSS if the budget demands it.
- Motion components must be `m.*` inside the strict `LazyMotion` boundary. A plain `motion.*` component throws in development.
- Unit tests run the stable `react` package, which lacks `ViewTransition`. `SharedElement` falls back to rendering its children unchanged there.
