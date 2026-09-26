// Tailwind class lists shared across the public site. Each variant is a
// complete list, so two conflicting utilities never meet on one element.
// Context that only exists at runtime (the header's scrolled and menu-open
// states, scroll reveals) uses the custom variants defined in globals.css.

export const container =
  "mx-auto w-[min(calc(100%-2*var(--gutter)),var(--container))]";

// Buttons. "dark" is for plum or photographic surfaces, where the primary
// action turns gold.
const BUTTON_BASE =
  "inline-flex cursor-pointer items-center justify-center gap-3 rounded-none border text-center text-[0.8125rem] leading-[1.3] font-medium tracking-[0.18em] uppercase [transition:background-color_var(--motion-fast)_ease,border-color_var(--motion-fast)_ease,color_var(--motion-fast)_ease,transform_var(--motion-fast)_ease] active:not-disabled:not-aria-disabled:[transform:scale(0.97)] disabled:cursor-progress disabled:opacity-70";

const BUTTON_TONES = {
  primary:
    "border-plum-700 bg-plum-700 text-surface hover:border-plum-900 hover:bg-plum-900",
  ghost:
    "border-current bg-transparent text-plum-800 hover:border-plum-800 hover:bg-plum-800 hover:text-surface",
  "primary-dark":
    "border-gold-400 bg-gold-400 text-plum-950 hover:border-gold-300 hover:bg-gold-300",
  "ghost-dark":
    "border-[rgb(255_255_255/0.6)] bg-transparent text-surface hover:border-surface hover:bg-surface hover:text-plum-900",
} as const;

export type ButtonTone = keyof typeof BUTTON_TONES;

export function button(tone: ButtonTone = "primary", extra = "") {
  return `${BUTTON_BASE} min-h-13 px-8 py-3 ${BUTTON_TONES[tone]}${extra ? ` ${extra}` : ""}`;
}

/** The header's Book now: transparent on the hero, plum once scrolled. */
export const headerButton = `${BUTTON_BASE} min-h-11 border-[rgb(219_175_113/0.85)] bg-transparent px-5 py-2 text-surface hover:border-gold-400 hover:bg-gold-400 hover:text-plum-950 max-md:px-3 max-md:tracking-[0.12em] max-[24rem]:px-2 max-[24rem]:text-[0.75rem] max-[24rem]:tracking-[0.08em] header-scrolled:border-plum-700 header-scrolled:bg-plum-700 header-scrolled:text-surface header-scrolled:hover:border-plum-900 header-scrolled:hover:bg-plum-900 header-menu-open:border-[rgb(219_175_113/0.85)] header-menu-open:bg-transparent`;

// Buttons inside a row of actions fill the row on phones.
export const actionFill = "max-md:w-full";

export const actions =
  "mt-10 flex flex-wrap items-start gap-4 empty:hidden max-md:*:flex-[1_1_100%]";

// Text links with a gold underline.
const LINK_BASE =
  "group/link inline-flex min-h-11 items-center gap-3 text-[0.8125rem] font-medium tracking-[0.18em] uppercase underline decoration-gold-400 decoration-1 underline-offset-[0.6em]";
export const link = `${LINK_BASE} text-plum-800`;
export const linkInverse = `${LINK_BASE} text-surface`;
export const linkIcon =
  "size-[1.125rem] flex-none [transition:transform_var(--motion-fast)_ease] group-hover/link:[transform:translateX(0.25rem)]";

export const icon = "size-5 flex-none";

// Type.
const EYEBROW_BASE =
  "m-0 mb-5 flex items-center gap-4 text-eyebrow leading-[1.4] font-medium tracking-[0.28em] uppercase before:h-px before:w-10 before:flex-none before:bg-current before:content-[''] revealed:before:origin-left revealed:before:[transition:transform_1s_var(--ease-out-soft)_0.25s] reveal-hidden:before:[transform:scaleX(0)] reveal-hidden:before:[transition:none]";
export const eyebrow = `${EYEBROW_BASE} text-gold-600`;
export const eyebrowDark = `${EYEBROW_BASE} text-gold-400`;

/** Section headings (h2) on light sections. */
export const sectionHeading =
  "m-0 max-w-[20ch] font-display text-display-md leading-[1.08] font-normal tracking-[-0.005em] text-balance text-plum-800";

/** Long-form managed text: paragraphs, headings, lists, and links. */
export const prose =
  "max-w-[42rem] text-[1.0625rem] leading-[1.75] text-neutral-800 [&>*]:m-0 [&>*+*]:mt-[1.25em] [&_a]:text-plum-700 [&_a]:underline [&_a]:underline-offset-[0.2em] [&_:is(h3,h4)]:mt-[2em] [&_:is(h3,h4)]:text-[1.0625rem] [&_:is(h3,h4)]:font-medium [&_:is(h3,h4)]:text-plum-800 [&_:is(ul,ol)]:grid [&_:is(ul,ol)]:gap-2 [&_:is(ul,ol)]:pl-0 [&_h2]:mt-[2.25em] [&_h2]:font-display [&_h2]:text-heading-lg [&_h2]:leading-[1.2] [&_h2]:font-normal [&_h2]:text-plum-800 [&_li]:flex [&_li]:items-baseline [&_li]:gap-3 [&_li]:before:size-1.5 [&_li]:before:flex-none [&_li]:before:border [&_li]:before:border-gold-600 [&_li]:before:content-[''] [&_li]:before:[transform:translateY(-0.2em)_rotate(45deg)]";
/** Prose inside a page section: its h2s also follow the section heading. */
export const proseInSection = `${prose} [&_h2]:max-w-[20ch] [&_h2]:tracking-[-0.005em] [&_h2]:text-balance`;
/** The first paragraph set large, for introductions. */
const LEAD =
  "[&>p:first-child]:font-display [&>p:first-child]:text-heading-lg [&>p:first-child]:leading-[1.45] [&>p:first-child]:text-neutral-950";
/** A lead introduction outside a page section (room and facility pages). */
export const proseLeadPlain = `${prose} ${LEAD}`;
export const proseLead = `${proseInSection} ${LEAD}`;

// Plum surfaces: heroes, bands, the contact block, holding pages.
export const plumSurface =
  "bg-plum-900 bg-[radial-gradient(ellipse_at_80%_15%,rgb(101_42_76/0.9),transparent_60%)] text-surface";

/** Children of a hero's text column rise in one after another. */
export const heroRise =
  "*:animate-[site-rise_900ms_var(--ease-out-soft)_both] [&>:nth-child(2)]:[animation-delay:120ms] [&>:nth-child(3)]:[animation-delay:260ms] [&>:nth-child(4)]:[animation-delay:400ms]";

export const heroTitle =
  "m-0 max-w-[16ch] font-display text-display-lg leading-[1.02] font-normal tracking-[-0.01em] text-balance";
export const heroLede =
  "mt-6 mb-0 max-w-[34rem] text-body-lg leading-[1.6] text-inverse-strong";

/** The crest's sun rays, faint and drawn once, behind hero text. */
export const heroRays =
  "absolute top-1/2 right-[clamp(-10rem,-8vw,-3rem)] -z-1 w-[clamp(22rem,50vw,46rem)] -translate-y-[42%] text-gold-400 opacity-14";

/** The brushed edge between a plum hero and the page. */
export const brushEdge =
  "pointer-events-none absolute right-0 -bottom-px left-0 z-1 block h-[clamp(1.25rem,3.2vw,3rem)] w-full text-canvas forced-colors:hidden";

/** A thin gold frame offset behind a photograph. */
export const goldFrame =
  "relative mr-6 mb-6 before:absolute before:inset-[1.5rem_-1.5rem_-1.5rem_1.5rem] before:border before:border-gold-rule before:content-[''] max-md:mr-4 max-md:mb-4 max-md:before:inset-[1rem_-1rem_-1rem_1rem]";

/**
 * A light page section. Consecutive light sections share one gap instead of
 * two (the element also carries data-light-section).
 */
export const lightSection =
  "py-(--space-section) [[data-light-section]+&]:pt-[calc(var(--space-section)*0.35)]";

const SECTION_HEADER_LAYOUT =
  "flex flex-wrap items-end justify-between gap-x-12 gap-y-6";
export const sectionHeader = `${SECTION_HEADER_LAYOUT} mb-[clamp(2.5rem,5vw,4rem)]`;
export const sectionHeaderFlush = `${SECTION_HEADER_LAYOUT} m-0`;

export const sectionHeadingOnPlum = sectionHeading.replace(
  "text-plum-800",
  "text-surface",
);

export const muted = "font-normal text-neutral-600";
export const empty = "m-0 max-w-[36rem] text-body-lg text-neutral-600";

/** An eyebrow with no space below (the booking panel, holding pages). */
export const eyebrowFlush = eyebrow.replace("m-0 mb-5", "m-0");
export const eyebrowDarkFlush = eyebrowDark.replace("m-0 mb-5", "m-0");

/** A section on a detail page that follows the main layout directly. */
export const flushSection =
  "pt-0 pb-(--space-section) [[data-light-section]+&]:pt-[calc(var(--space-section)*0.35)]";

// Room and facility pages: main column beside a sticky booking panel.
export const detailLayout =
  "grid grid-cols-[minmax(0,1fr)_minmax(18rem,23rem)] items-start gap-[clamp(2.5rem,7vw,7rem)] py-[clamp(3.5rem,7vw,6rem)] max-lg:grid-cols-[minmax(0,1fr)]";
export const detailHeading =
  "mt-0 mb-6 font-display text-heading-lg font-normal text-plum-800";
export const detailAside =
  "sticky top-[calc(var(--header-height-compact)+1.5rem)] grid gap-6 border-t-2 border-t-gold-400 bg-surface p-[clamp(1.5rem,3vw,2.25rem)] shadow-[var(--shadow-md)] max-lg:static";
export const featureList =
  "m-0 grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-x-8 gap-y-0 border-t border-neutral-300 p-0";
export const featureItem =
  "flex items-center gap-4 border-b border-neutral-300 py-4 text-neutral-800 before:size-[0.4375rem] before:flex-none before:border before:border-gold-600 before:[transform:rotate(45deg)] before:content-['']";

// Holding, error, and not-found screens on plum.
export const holding = `relative grid min-h-svh items-center ${plumSurface}`;
export const holdingContent = `${container} grid justify-items-start gap-5`;
export const holdingText = "m-0 max-w-[36rem] text-inverse-strong";
export const holdingEyebrow = `${eyebrowDarkFlush} max-w-[36rem]`;
export const holdingMuted = "m-0 max-w-[36rem] font-normal text-inverse-muted";
export const holdingActions =
  "m-0 flex max-w-[36rem] flex-wrap items-center gap-4 text-inverse-strong";
