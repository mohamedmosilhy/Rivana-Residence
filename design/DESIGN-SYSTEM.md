# Rivana Residence — implementation design system

This specification converts the live-site observations into stable CSS/JS primitives for a local HTML/CSS/JavaScript build. It is intentionally prescriptive where the implementation needs a decision and preserves the reference’s square, editorial hotel aesthetic.

## 1. CSS foundation

```css
:root {
  /* Color */
  --color-plum: #652a4c;
  --color-plum-dark: #51213d;
  --color-plum-rgb: 101 42 76;
  --color-canvas: #f9f9f9;
  --color-surface: #ffffff;
  --color-ink: #222222;
  --color-heading: #272727;
  --color-muted: #949c9b;
  --color-subtle: #a5a5a5;
  --color-line: #e6e6e6;
  --color-line-dark: #8f8f8f;
  --color-white: #ffffff;
  --color-gold: #d7b573; /* use the logo artwork for exact brand gold */
  --color-availability: #89b63c;

  /* Typography */
  --font-display: "Marcellus", Georgia, serif;
  --font-body: "Jost", Arial, sans-serif;
  --font-action: "Oswald", Arial, sans-serif;
  --font-footer: "Lato", Arial, sans-serif;

  --font-weight-light: 300;
  --font-weight-regular: 400;
  --font-weight-medium: 500;

  --text-xs: 0.6875rem;  /* 11px */
  --text-sm: 0.875rem;   /* 14px */
  --text-base: 0.9375rem;/* 15px */
  --text-md: 1rem;       /* 16px */
  --text-lg: 1.375rem;   /* 22px */
  --text-xl: 1.625rem;   /* 26px */
  --text-2xl: 2rem;      /* 32px */
  --text-3xl: 2.5rem;    /* 40px */
  --text-4xl: 3.4375rem; /* 55px */
  --text-5xl: 3.75rem;   /* 60px */

  --leading-tight: 1;
  --leading-display: 1.1;
  --leading-body: 1.8;

  /* Space: base 4px */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --space-15: 3.75rem;
  --space-20: 5rem;
  --space-25: 6.25rem;
  --space-30: 7.5rem;

  /* Layout */
  --container-max: 71.25rem; /* 1140px */
  --container-gutter: 1.25rem;
  --container-gutter-desktop: 4.375rem; /* 70px @ 1280px */
  --grid-gap: 2.5rem; /* 40px */

  /* Borders, depth, corners */
  --radius-none: 0;
  --radius-pill: 999px;
  --border-default: 1px solid var(--color-line);
  --border-dark: 1px solid var(--color-line-dark);
  --border-action: 2px solid var(--color-plum);
  --shadow-panel: 0 12px 28px rgb(0 0 0 / 0.08);
  --shadow-menu: 0 5px 40px rgb(0 0 0 / 0.15);
  --shadow-floating: 0 8px 15px rgb(0 0 0 / 0.10);

  /* Motion */
  --duration-fast: 200ms;
  --duration-base: 300ms;
  --duration-drawer: 400ms;
  --duration-reveal: 800ms;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-standard: ease;
}
```

## 2. Global styles

```css
html { scroll-behavior: smooth; }

body {
  margin: 0;
  background: var(--color-canvas);
  color: var(--color-ink);
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: var(--font-weight-medium);
  line-height: var(--leading-body); /* 27px at 15px */
}

*, *::before, *::after { box-sizing: border-box; }
img { display: block; max-width: 100%; }
a { color: inherit; text-decoration: none; }
button, input, select, textarea { font: inherit; }
```

- Use only square component corners (`0`) in page content. Pill shaping is reserved for compact mobile contact actions and the circular chat helper.
- Avoid heavy depth. Only elevated white panels (search, contact/booking blocks) use `--shadow-panel`; desktop submenu uses `--shadow-menu`.
- Use a warm white canvas. Do not substitute cool gray page backgrounds or saturated purple variants.

## 3. Typography and heading contracts

| Token / class | Desktop | ≤767px | Family / color / use |
| --- | --- | --- | --- |
| `.display-page` | 60px / 66px | 34px / 37.4px | Marcellus 400, white or heading ink; page and room hero titles |
| `.display-section` | 60px / 66px | 36px / 40px | Marcellus 400; sectional two-tone headings |
| `.display-home` | 55px / 55px | 31px / 37.2px | Marcellus 400, white; Home H1 |
| `.heading-card` | 32px / 41.6px | 28px / 36px | Marcellus 400; room titles |
| `.heading-contact` | 40px / 40px | 32px / 36px | Marcellus 400; Talk / Meet / Connect |
| `.heading-quote` | 26px / 39px | 22px / 33px | Marcellus 400; feature quotes |
| `.eyebrow` | 22px / 22px | 18px / 24px | Marcellus 400; sentence-case intro line |
| `.body-copy` | 15px / 27px | 15px / 27px | Jost 500; paragraphs and metadata |
| `.label` | 14–15px / 22px | same | Jost 500; form labels/navigation |
| `.action-label` | 14px / 22.4px, 1px tracking | same | Oswald 400; primary buttons |

### Two-tone editorial heading

Use separate inline elements, not a gradient, for titles such as “Our Rooms” and “Have any questions?”:

```html
<h2 class="display-section">
  <span class="text-muted">Our</span>
  <span class="text-default">Rooms</span>
</h2>
```

- `text-muted`: `var(--color-muted)`.
- `text-default`: `var(--color-heading)` on light backgrounds, `var(--color-white)` on plum.
- Major display titles may be split into words/characters for reveal animation, but must remain one semantic heading.

## 4. Layout, containers, grids, and section spacing

```css
.container {
  width: min(calc(100% - (2 * var(--container-gutter))), var(--container-max));
  margin-inline: auto;
}

.section { padding-block: var(--space-25) var(--space-20); }
.section--deep { padding-block: var(--space-30) var(--space-20); }
.section--cta { padding-block: var(--space-30) var(--space-20); }
.surface-panel { background: var(--color-surface); box-shadow: var(--shadow-panel); }
.field-rule { border-bottom: var(--border-dark); }
```

| Layout primitive | Desktop | Tablet (768–1024px) | Mobile (≤767px) |
| --- | --- | --- | --- |
| Main container | max 1140px | 100% minus 48px | 100% minus 40px (350px at 390px) |
| Room listing | 2 equal columns / 40px gap | 2 columns / 24px gap | 1 column / 24px gap |
| Room photo gallery | 3 equal columns / 40px gap | 2 columns / 24px gap | 1 column / 40px vertical gap |
| Amenities | 3 equal columns | 3 equal columns if viable; otherwise 2 | 1 column |
| Contact panel | information 30% + form 70% | 40% + 60% | stacked |
| Footer | 3 columns | 3 compact columns | stacked, 32–40px gaps |
| Booking search | date/date/action 3-column | 3 compact columns | stack all fields and action |

- Use `gap: 40px` for the principal desktop grids. Do not use `border-radius` or per-card shadows to define them.
- Regular white sections: 100px top / 80px bottom. Contact/booking blocks: 80px top / 100px bottom. Plum CTA/footer region: 120px top / 80px bottom.
- Retain intentional blank air around page heroes and between title bands and media. The source design is not dense.

## 5. Image rules

| Usage | Ratio / sizing | Treatment |
| --- | --- | --- |
| Home hero | full viewport width; about 648px desktop | `object-fit: cover`; dark overlay; central composition |
| Feature amenity photo | landscape 16:9-ish | full/contained width; no radius |
| Room listing cards | 3:2 | `object-fit: cover` |
| Room detail gallery | 3:2 (700×466 source) | 3-column desktop; full-width mobile; plum background |
| Amenity service cards | fixed wide landscape | background cover + readable dark overlay / white type |
| About exterior | portrait asset | `object-fit: cover`; preserve tall crop |

Images must be warm, low-saturation interior/property photography. Use a dark overlay only where white text appears over the image. Add a restrained `scale(1.03)` image-hover transition only to linked card/media containers.

## 6. Components

### Header

**Desktop dimensions and states**

- Fixed at top, full width, `z-index: 100`.
- Initial visual assembly: 162–171px high. Use `height: 162px` as the target starting header; centered logo around 165px wide.
- Scrolled state: 108px height, warm-white surface, compact logo around 95px wide, dark navigation.
- Transition background, height, logo width, and nav color in `300ms var(--ease-standard)`.
- Desktop nav is an equal left/right composition around the centered logo. Keep the exact link order from the reference.

```css
.site-header {
  position: fixed; inset: 0 0 auto; z-index: 100;
  height: 162px;
  color: var(--color-white);
  transition: height var(--duration-base) var(--ease-standard),
              background-color var(--duration-base) var(--ease-standard),
              color var(--duration-fast) linear;
}
.site-header.is-scrolled {
  height: 108px;
  background: rgb(255 255 255 / 0.93);
  color: var(--color-ink);
}
```

### Navigation and submenu

- Jost 500, ~15px. Active item uses `--color-gold`.
- Hover/current underline: 1px line, `transform: scaleX(0 → 1)`, origin changes right-to-left to left-to-right, `200ms ease-out`.
- “Our Rooms” shows a 200px white submenu. Default `opacity: 0`, `transform: translateY(-15px)`, no interactive pointer events; on hover/focus it becomes visible in `200ms ease-out`, with `--shadow-menu`.
- A small chevron follows the rooms label.

### Mobile menu

- Activate at `max-width: 767px`; hide desktop navigation.
- Fixed header height: 96px. Logo left at 20px gutter. Hamburger right at 20px.
- Drawer: fixed left white panel, 270px width at 390px, full viewport height, z-index above page; translateX(-100%) while closed, `translateX(0)` while open. Page is visually pushed right by the panel in the reference; use a `.menu-open` page transform if preserving that behavior.
- `transition: transform 400ms ease`. Links: Jost 500, 20px; `margin-block: 14px`; vertically centered grouping.
- Close on backdrop/escaped key. Maintain focus trapping and `aria-expanded` for implementation accessibility.

### Hero and page hero / breadcrumb

- A hero is a full-bleed visual band with the header positioned over it.
- Home: photo background, 648px minimum desktop height; dark overlay; centered white eyebrow and display title; booking search panel overlaps lower edge.
- Internal page hero: plum background, shallow white brush separator along the bottom. Use a reusable transparent SVG asset layered at the lower edge, full width; do not replace it with a generic diagonal.
- Internal hero height targets: Contact/Our Rooms 500px; About 550px; Pool 606px; Gym 641px; Room detail is a variable plum information/gallery field.
- Breadcrumbs were not visually present in the sampled site. Do not add them by default; call this component `PageHero` rather than adding an invented breadcrumb trail.

### Section heading

- Eyebrow above display heading, then large two-tone display line.
- On plum: eyebrow white, first term muted, second white. On canvas: eyebrow heading ink, first term muted, second heading ink.
- Typical spacing: 16–24px between eyebrow/title; 40–60px from title to content.

### Buttons and links

```css
.button-primary {
  min-height: 48px;
  padding: 11px 40px 10px;
  border: var(--border-action);
  border-radius: var(--radius-none);
  background: var(--color-plum);
  color: var(--color-white);
  font-family: var(--font-action);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-regular);
  letter-spacing: 0.0625rem;
  line-height: 1.6;
  transition: background-color var(--duration-base) linear,
              color var(--duration-fast) linear,
              opacity var(--duration-fast) linear;
}
.button-primary:hover { background: var(--color-plum-dark); }
```

- Links are plain text links; navigation links use the underline reveal. Text CTAs (“Learn More”, “View All Rooms”) should not become big rounded buttons.
- Mobile quick actions use `border-radius: var(--radius-pill)`, gold background, white label/icon, and `--shadow-floating`.

### Room card

- Image first, 3:2. Content remains flat on canvas/surface—no radius, no card shadow.
- Title: `.heading-card`; then compact Jost metadata/price.
- Listing variant adds a three-stat row with large numeric value and small uppercase descriptor, plus Book Now action.
- Linked image/media uses a 300ms ease-out crop scale on hover; copy stays stable.

### Amenity card

- Full-bleed photographic tile with dark overlay.
- White Oswald 28px service title; white Jost supporting copy.
- Home has Cafe, Gym, Swimming Pool. The shared lower amenity strip uses Wellness & Spa, Fitness Center, Swimming Pool.

### CTA and Contact form

- CTA section starts with eyebrow + two-tone display title, then a square white panel.
- Panel split: left contact details / right form. On mobile, stack.
- Form labels are Jost 500, dark. Inputs and textarea are white with only a 1px gray bottom border, no radius, no heavy field outline. Input vertical padding: 10px top/bottom.
- Textarea should be visibly taller (minimum 140px). Submit uses `.button-primary`.

### Footer

- Plum background; deep padding (120px 0 80px desktop).
- Three columns: brand/contact/address; room links; other/social links.
- Footer headings: Lato 300, 22px, white. Supporting links: small white/soft-white Jost. Keep row spacing open and unboxed.
- Separate legal strip: 40px vertical padding; copyright/developer left and policy links right desktop; stack mobile.

### Image gallery

- Room gallery: plum field with 3:2 grid tiles; 40px desktop gaps, 40px mobile vertical gaps; linked photos can open a local lightbox.
- Gym/Pool gallery: feature/carousel region with square minimal previous/next arrow buttons. Disabled previous state at first item. Never style these as rounded floating controls.

### Room details

- On plum: left page title, right small “from” followed by 60px price; two thin translucent white rules.
- Fact grid has four cells: Size, Bed, Capacity, View. Label uses white with reduced opacity; values white. Collapse cleanly to 2×2 then stacked on narrow widths.

### Booking/date form

- Search form uses 3 desktop columns and one mobile column.
- Fields: label above light placeholder; bottom-rule input style. Required asterisk follows label.
- Calendar is a broad white panel with thin gray gridlines, small Jost labels, available date green. Keep booking data local/static unless a later task asks for real availability.

## 7. Breakpoints and responsive rules

```css
/* mobile-first overrides */
@media (min-width: 768px) { /* tablet layout */ }
@media (min-width: 1025px) { /* desktop layout */ }

/* source-aligned boundaries */
@media (max-width: 1024px) { /* reduce broad whitespace and gallery/list grids */ }
@media (max-width: 767px) { /* drawer nav, one-column content, compact type */ }
```

- **≤767px:** header becomes compact/hamburger; all card, gallery, form, CTA, footer content becomes single column; content gutter is 20px; full display titles use mobile scale.
- **768–1024px:** retain horizontal header navigation when it fits; reduce container gutter to 24px; gallery may become 2 columns; keep page heroes spacious but reduce editorial titles if wrapping is excessive.
- **≥1025px:** use 1140px centered container and the target 40px grid gaps; show split desktop navigation.

## 8. Motion system

```css
.reveal {
  opacity: 0;
  transform: translateY(5%);
  transition: opacity var(--duration-reveal) var(--ease-out),
              transform var(--duration-reveal) var(--ease-out);
}
.reveal.is-visible { opacity: 1; transform: translateY(0); }
.reveal--d1 { transition-delay: 150ms; }
.reveal--d2 { transition-delay: 250ms; }
.reveal--d3 { transition-delay: 350ms; }
.reveal--d4 { transition-delay: 450ms; }
```

| Interaction | Duration / easing | Visual change |
| --- | --- | --- |
| Section entrance | 800ms `cubic-bezier(0.23, 1, 0.32, 1)` | fade + 5% upward settle, staggered 150–450ms |
| Header mode | 300ms ease / color 200ms linear | surface, height, logo size, navigation color |
| Desktop submenu | 200ms ease-out | opacity + `translateY(-15px)` |
| Navigation underline | 200ms ease-out | 1px `scaleX` reveal |
| Button/link image hover | 200–300ms linear/ease | slight color, opacity, or `scale(1.03)` |
| Mobile drawer | 400ms ease | horizontal translation |
| Input border state | 300ms linear | underline color only |

Honor `prefers-reduced-motion: reduce` by disabling transforms/entrance sequencing and leaving content immediately visible.

## 9. Implementation guardrails

- Use the actual supplied logo/photographic/brush assets; do not draw a substitute logo or turn the brush separator into a rounded wave.
- Maintain the narrow color palette. Gold is an accent, not a general button color except the mobile quick-action cluster and existing chat/back-to-top helpers.
- Preserve the header’s two modes and photo/plum overlap relationships—the fixed header and overlapping search panel are key visual anchors.
- Forms and booking controls must look functional but remain local/non-submitting for this reference project.
- This system defines reusable components and tokens only. Build pages only after the implementation phase is explicitly requested.
