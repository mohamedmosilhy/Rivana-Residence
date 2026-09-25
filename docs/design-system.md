# Design system

## Reference findings

The supplied study establishes a recognizable, restrained identity:

- deep aubergine/plum fields, warm-white canvas, muted gray editorial text, and gold logo/action accents;
- Marcellus for large editorial headings, Jost for body/navigation, Oswald for compact action labels, and Lato for selected footer typography;
- full-bleed photography, square corners, sparse shadows, thin rules, and a brush-like boundary between plum and light sections;
- a 1140px desktop container, 20px mobile gutters, generous 60–120px vertical rhythm;
- transparent fixed header over the hero, then a compact light header after scrolling;
- controlled fade/translate reveals around 800ms with a pronounced ease-out curve;
- single-column mobile layouts and an off-canvas menu.

Production should preserve these signals while improving consistency, accessibility, image quality, and interaction semantics. The existing CSS is a reference, not a stylesheet to copy.

## Production visual direction

“Modern luxury hospitality” means strong photography, editorial scale, quiet surfaces, precise spacing, and subtle motion. It does not mean indiscriminate glass panels, blur, gradients, or excessive rounded cards.

Modernization principles:

- let images and typography carry hierarchy;
- use plum as a confident field, not on every surface;
- reserve gold for small high-value accents and focus/active details;
- introduce soft translucent header/overlay surfaces only where they improve contrast;
- use slight radius only for controls/admin UI; keep public editorial images mostly square;
- keep motion short, interruptible, and non-essential.

## Color tokens

```text
brand.plum.950   #2A1020  footer, menu panel, darkest field
brand.plum.900   #3F1930  deep contrast/pressed
brand.plum.800   #51213D  hover/deep surface
brand.plum.700   #652A4C  primary reference plum
brand.plum.100   #F1E8ED  subtle tint
brand.gold.600   #8E6230  small accents/eyebrows on light (5.03:1 on canvas)
brand.gold.400   #DBAF71  logo, accents, actions and focus on plum
brand.gold.300   #E8C795  gold action hover
gold.rule        #DBAF71 at 55%  offset image frames
neutral.950      #1F1B1D  primary ink
neutral.800      #322E30  headings
neutral.600      #6E686B  body-muted (preferred over low-contrast #949C9B)
neutral.300      #D9D4D6  rules
canvas           #FAF8F6  warm site background
header.surface   #FAF8F6 at 94%  scrolled header (with backdrop blur)
control.border   #8A8286  form control borders (3.53:1 on canvas)
surface          #FFFFFF
success          #2F6F47
warning          #9A6417
danger           #B42318
focus            #8A5A24  paired with outline geometry
```

Reference `#949C9B` may remain decorative at large sizes but must not be used for small essential text without a contrast check. All token pairings are verified against WCAG AA during implementation.

## Typography

- Display: Marcellus 400, self-hosted if licensing is confirmed.
- Body/UI: Jost 400/500/600, self-hosted and subset.
- Action condensed face: Oswald 400 only where the reference character matters; standard admin controls use Jost.
- Footer should not require Lato unless visual comparison proves it adds value; removing a redundant font reduces transfer cost.

Fluid public type scale using `clamp`:

| Token | Mobile → desktop | Use |
| --- | --- | --- |
| `display-xl` | 3rem → 6.5rem | home hero |
| `display-lg` | 2.375rem → 4.5rem | page/detail hero, contact call to action |
| `display-md` | 1.875rem → 3.25rem | section title, footer statement |
| `heading-lg` | 1.5rem → 2rem | card/detail title |
| `heading-md` | 1.25rem → 1.5rem | subsection |
| `body-lg` | 1.0625rem → 1.1875rem | lead copy |
| `body` | 1rem | default copy |
| `small` | 0.875rem | metadata |
| `eyebrow` | 0.75rem | uppercase, 0.28em tracking, preceded by a 40px gold rule |

Body line height is 1.65; display lines use 0.98–1.12. Long text blocks target 60–72 characters.

## Spacing and layout

Base space tokens: `1=4`, `2=8`, `3=12`, `4=16`, `5=20`, `6=24`, `8=32`, `10=40`, `12=48`, `16=64`, `20=80`, `24=96`, `30=120` pixels.

- content container max: 1200px; editorial text max: 720px; wide media max: 1440px;
- inline gutters: 20px phone, 32px tablet, 48–72px desktop;
- section block space: `clamp(64px, 8vw, 120px)`;
- grid gaps: 24px phone, 32–48px desktop;
- breakpoints follow content needs, with expected bands around 640, 768, 1024, 1280px rather than device names.

## Radius, borders, and shadows

- public image/card/button/control radius: `0` (`--radius-public`);
- controls: 6px; dialogs/admin cards: 10px; pills only for genuine pills/statuses;
- border: 1px neutral rule or translucent white;
- shadow-sm: low-opacity separation for sticky header;
- shadow-md: booking/contact/admin floating panel only;
- avoid stacked shadows and hover elevation on every card.

## Buttons

- `primary`: plum fill, white label;
- `secondary`: dark text, 1px dark border, transparent background;
- `inverse`: transparent/white border over dark surfaces;
- `text`: text plus restrained directional rule/icon;
- `destructive`: danger styling, admin only;
- `booking-disabled`: visually complete primary/inverse treatment with disabled cursor, reduced emphasis, and accessible explanation.

Minimum touch target: 44×44px. Every state includes hover (when available), focus-visible, active, disabled, and pending. Do not use motion alone to convey state.

## Cards and sections

- Room cards foreground property imagery and show only verified marketing facts—never price.
- Facility cards use persistent readable labels; supporting copy cannot exist only on hover.
- Editorial split sections may use a quiet surface or subtle warm gradient, not heavy glass.
- Contact panels may use a soft shadow to separate from canvas.
- Public cards remain compositionally open; admin cards can use clearer borders/radius for task efficiency.

## Forms

- Persistent labels above controls; placeholders are examples, not labels.
- Minimum 44px control height, visible border, clear focus ring, and adjacent help/error text.
- Errors use text plus color and link to an error summary on long admin forms.
- Required state is announced programmatically.
- Destructive confirmation states name the affected record.

## Promotion popup

- Use one restrained dialog/card, not a full-screen takeover: warm-white surface, plum heading/action, thin neutral rule, and a small gold accent.
- Keep the headline and message short; show the code in a high-contrast, selectable monospace-style row with an adjacent 44px-minimum “Copy code” button.
- Terms are visible in the dialog or available through a clearly labelled disclosure; they are never hidden only in hover text.
- Provide a prominent labelled close button, Escape dismissal, focus containment/return, and an `aria-live` copy result.
- On small screens, use safe-area-aware side/bottom gutters and allow content to scroll without covering the close action.
- Do not auto-cycle campaigns, play sound, use countdown pressure, or reopen repeatedly after dismissal. Default dismissal lasts for that promotion/version for seven days; an updated campaign version can display again.

## Motion

- micro transitions: 120–220ms;
- header/surface transition: 200–300ms;
- section reveal: 500–800ms with `cubic-bezier(.23,1,.32,1)`;
- stagger limited to a few groups; per-character reveal is reserved for one major hero and must never delay readability;
- image hover scale max 1.02–1.03;
- no automatic carousel movement, scroll-jacking, or unverified parallax;
- `prefers-reduced-motion: reduce` removes transforms, smooth scrolling, and stagger while keeping content visible.

## Responsive and interaction corrections from the reference

- Desktop submenu must be keyboard-operable and not depend only on hover.
- Mobile drawer needs a labelled close action, focus containment/return, Escape handling, and non-interactive background.
- Floating mobile actions must not obscure form controls or browser safe areas.
- Gallery arrows and drag gestures need keyboard buttons, current-position status, and swipe as an enhancement.
- Hover-revealed facility text becomes persistently visible on touch/coarse-pointer devices.
- The brush edge should be a lightweight local SVG/mask, not a fragile polygon approximation across every width.

## Image direction

- prioritize authentic property, room, staff, and facility photography;
- preserve warm wood and plum/gold brand tones without heavy global filters;
- define editorial crops per usage and use focal points;
- never upscale 700×466 room images into oversized full-bleed desktop heroes;
- verify rights for stock-looking `amenity-spa`, `amenity-fitness`, and `amenity-pool` images before production use.

## Token implementation

CSS custom properties are the source of truth and are exposed to Tailwind through its theme system. shadcn variables map to the same semantic tokens. Arbitrary values are allowed only for a documented one-off composition and should not reproduce a parallel hidden design system.

## Phase 8 implementation notes

The tokens above live in `src/app/globals.css` (`:root`) and every public rule reads them; Tailwind receives the same values through `@theme inline`. `scripts/contrast-report.mts` recomputes every pairing and is the contrast source of truth. The phase evidence is in [phase-8-visual-system.md](./phase-8-visual-system.md).

- **Header:** transparent over the hero with the inverse logo and a soft top scrim. With JavaScript it is fixed and turns into the warm translucent surface with the light-background logo after 24px of scroll. Without JavaScript it scrolls away, so it is always readable.
- **Brush edge and sun rays:** both are inline SVG (`src/presentation/site/ornaments.tsx`). The rays repeat the crest's 270° arc at low opacity as a watermark on plum surfaces.
- **Heroes:** the home hero fills the viewport, and other managed heroes are shorter. Room and facility heroes are full-bleed only when the photo is at least 1400px wide. Otherwise the photo sits beside the title at natural size in a gold offset frame.
- **Cards:** room cards are open editorial compositions (4:5 image, index number, fact line, “Discover”). Facility tiles are photographic, with persistent labels over a dark scrim.
- **Motion:** only hover and colour feedback (160–240ms), a 1.03 image scale on hover-capable pointers, and the header surface change. Phase 9 adds the motion layer described below.

## Phase 9 motion implementation notes

Evidence: [phase-9-motion.md](./phase-9-motion.md). Decision record: [ADR 012](./adr/012-motion-library.md).

- **First paint (CSS):** the home title's letter reveal (a 35ms step, finishing within about 1s), text entrances staggered by 120–140ms, the hero photo settling from a 1.12 zoom over 2.4s, and the crest rays drawing once. Every keyframe ends visible, so nothing waits for JavaScript.
- **Scroll reveals (Motion):** a 36px rise over 0.8s with `cubic-bezier(.23,1,.32,1)`; groups stagger by 0.08–0.12s. Photos are uncovered by a plum curtain (1.1s) while settling from a 1.14 zoom. Only content below the fold at hydration is ever hidden.
- **Hero depth:** the photo drifts at 30% of scroll speed, and the text fades to 10% opacity over the first 700px. This is the one approved parallax exception (client request, transform only).
- **Header:** tucks away (520ms) after 480px while scrolling down; returns on scroll up or focus. A 2px gold rule scales with reading progress.
- **Menu sheet:** slides down in 640ms with links staggering by 60ms; closes in 420ms.
- **Photo viewer:** photos slide 72px and crossfade (0.55s in, 0.3s out); square-edged 52px controls; thumbnails at 45% opacity until current.
- **Page morph:** 700ms view-transition morph with a brief 2px blur midway.
- **Reduced motion:** no hiding, no parallax, no header tuck; CSS animations finish instantly with no delay; view transitions are instant.
