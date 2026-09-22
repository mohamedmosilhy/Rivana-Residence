# Rivana Residence — visual reference specification

**Scope.** This is an observation-led specification for recreating the live site as a local HTML/CSS/JavaScript design-study project. It covers the live Home, About, Contact, Gym, Swimming Pool, Our Rooms, and Studio With Balcony Room pages, plus the other two room pages by shared-template inference. No implementation is included here.

**Reference inspected:** `https://rivanaresidence.com/` on desktop at 1280 × 720 and mobile at 390 × 844. Measurements are observed rendered values at the desktop reference width unless marked responsive.

## 1. Shared design system

### Visual identity

The visual language is understated hotel luxury: deep aubergine/plum fields, warm white canvas, muted gray editorial type, gold in the brand mark and small action accents, and warm, darkened property photography. The repeating compositional signature is a full-bleed plum hero ending in a thin, hand-painted white curved brush-stroke edge. Photography is rectilinear with no rounded corners.

### Color tokens

| Token | Observed value | Use |
| --- | --- | --- |
| `--plum` | `#652A4C` / `rgb(101,42,76)` | Hero panels, room gallery ground, footer, primary action fill |
| `--canvas` | `#F9F9F9` | Primary page background |
| `--surface` | `#FFFFFF` | Booking and contact panels |
| `--ink` | `#222222` | Body/default dark text |
| `--heading-ink` | `#272727` | Large dark headings |
| `--muted` | `#949C9B` | First word / de-emphasized editorial headings |
| `--white` | `#FFFFFF` | Text over plum/photo |
| `--line` | near `#E6E6E6` on light / translucent white on plum | Rules, form underlines, gallery/calendar grid |
| `--gold` | warm muted gold (brand/logo; active-nav and floating actions) | Brand accent; retain actual logo asset rather than approximating |

### Typography

| Role | Family | Weight | Desktop observed sizes / treatment |
| --- | --- | --- |
| Editorial display / all large headings | `Marcellus`, sans-serif fallback | 400 | 60px / 66px for sectional and page titles; hero Home H1 55px / 55px; quote 26px / 39px; contact detail labels 40px / 40px |
| Small editorial eyebrow | `Marcellus` | 400 | 22px / 22px |
| Body, form labels, menu, metadata | `Jost` | 500 default | 15px / 27px body; compact labels around 14–15px |
| Buttons and amenity-card titles | `Oswald` | 400 | 14px with 1px tracking on primary buttons; 28px / 36.4px on amenity titles |
| Footer headings | `Lato`, sans-serif | 300 | 22px / 22px |

Large display text is intentionally split across individual letter/word spans in the live build, yielding staggered entrance reveals and sometimes loose visual tracking. Implement the *visual* outcome rather than forcing letter spacing in the font itself. On 390px, main titles reduce to about 31px / 37.2px (Home) and 34px / 37.4px (room page); preserve the deliberate multi-line wrapping.

### Layout, rhythm, and surfaces

- Desktop content container: **1140px** at a 1280px viewport (70px side gutters). Most boxed content uses this. The large booking/search panel also aligns to x=70 and is 1140px wide.
- Full-width sections span the viewport; galleries and photo/amenity grids may use either the 1140px container or full bleed.
- Core vertical rhythm is 20px, 40px, 60px, 80px, 100px, 120px. Common section padding: 100px 0 80px; deep footer/CTA padding: 120px top / 80px bottom.
- White raised panels have square corners and a very soft, diffuse gray shadow. The Home search card sits partly over the hero boundary.
- Borders are minimal: thin 1px rules, underline-only text inputs, and 2px primary button borders.
- Background imagery uses `cover`, frequently with a dark translucent overlay for text legibility; no visible border radius.

## 2. Shared components

### Header and navigation

- Header is fixed. It has two visual states:
  - **At top over photo/plum:** transparent; white nav labels and the large white/gold primary logo, centered. Desktop nav is balanced either side of the logo: `Home`, `Our Rooms` (chevron), `About` on the left; `Swimming Pool`, `Gym`, `Contact` on the right.
  - **After scrolling:** an approximately 107–116px warm-white fixed bar; compact dark/gold logo and dark nav. The room gallery reference shows this state clearly.
- Initial desktop header assembly is roughly 162–171px tall including its surrounding Elementor layout; logo is centered and visually about 165px wide. Scroll logo visibly contracts.
- Desktop navigation is a single row; items are around 15px Jost. The active item uses gold. Hover adds an animated 1px underline that grows from the left; color changes are subtle.
- `Our Rooms` exposes a 200px-wide white drop-down with Deluxe Double Room, Studio With Balcony Room, and Studio With Pool View Room. It starts shifted up by 15px at opacity 0 and resolves in ~200ms with a soft large shadow.
- The global header should remain usable above all hero/gallery content. On all sampled pages it changes appearance, not position, on scroll.

### Mobile header and menu

- At ≤767px, desktop nav is hidden. The fixed top header is roughly 95px high, with logo at x=20 and a black three-bar hamburger at the right (about x=352 on a 390px viewport).
- Opening the hamburger exposes a left off-canvas white sheet approximately **270px wide** in the observed 390px capture. The page remains visible, shifted to the right; menu links are vertically centered in the sheet, black, bold Jost, roughly 20px, with ~40px row rhythm.
- Items: Home, Our Rooms, About, Swimming Pool, Gym, Contact. No nested room items were observed in the mobile panel.
- Implement the observed 400ms horizontal drawer transition. Allow overlay click / explicit close control to dismiss. Avoid inventing a dark scrim: the sampled drawer reads as a clean white slab with the content still exposed at right.
- On mobile, persistent gold pill actions sit above the bottom edge: **Book Now** (calendar icon), **Call us** (phone), **WhatsApp** (WhatsApp icon). They are three compact buttons across the width with white text and shadow.

### Primary and text actions

- Filled primary button: plum background and 2px plum border; white Oswald 14px uppercase-ish label, 1px letter spacing; 11px 40px 10px padding. Typical Home search button appears about 207×48px.
- Hover should retain the restrained theme: opacity/color/background transition (observed 0.2–0.3s), no bounce or pill rounding.
- Text actions such as “Learn More” and “View All Rooms” are simple link treatments, not outlined buttons.

### Booking/search components

- **Home / Rooms search card:** white, square, shadowed panel. Desktop: 1140px wide, approximately 155px high; three columns: Check-in, Check-out, Search. Inputs are labeled in dark bold Jost with required asterisk; light-gray placeholder; only a dark-gray bottom rule; search button fills its column. Home card overlaps the lower hero edge.
- At mobile width it becomes a narrow white card with 40px-ish inner side padding: check-in, check-out, and full-width search stack vertically. Inputs keep underline treatment; card exceeds the initial viewport and begins around the bottom of the hero.
- **Room booking widget:** “Ready to book” editorial heading; broad white calendar/booking panel. Calendar has plain thin gray grid, four months visible on desktop, centered “Today”, `<Prev` and `Next>` controls, green available-date numbers, small black month/day labels. Beneath: required check-in/check-out fields, guest selector, and submit/action buttons. Recreate the interaction structure locally without fabricating availability data.

### Room cards

- Home: three room cards in a horizontal carousel-like row. Each image sits above a white textual area containing Marcellus 32px title and compact metadata (`55 m2 / 2 adults 1 children from $70`, etc.).
- Our Rooms listing: large two-column card grid under the search panel. Cards show room photography, room title, a three-stat row (size, max adults, max children), price, and “Book Now.” Desktop gallery/list gutter is roughly 40px.
- Images fill their fixed aspect containers using `object-fit: cover`; no rounded corners. Hover treatment should be a mild image scale/darken or existing link overlay, not a new card elevation system.

### Contact panel and footer

- Shared “Have any questions?” contact CTA: light canvas section with eyebrow “Make your stay memorable,” large two-tone `Have` / `any questions?` display title, then a white two-column panel. Left column: Talk (phone), Meet (multiline address), Connect (email); labels are Marcellus 40px. Right column: Contact Form with name, email, message, and plum submit.
- Footer is plum. Desktop has three columns in a 1140px container: logo/contact/address; “Our Rooms” links; “Other Links” plus social links. Social set: Facebook, Instagram, TikTok, X/Twitter, YouTube, Threads, LinkedIn.
- A short plum legal bar follows: copyright/developer on left and Terms & Conditions / Refund Policy on right. Footer headings use light Lato; links/body copy are white or soft-white.
- Global helpers: a small circular gold chat bubble at the lower right; a square gold back-to-top control appears once the page is scrolled (in some captures adjacent to the chat bubble).

## 3. Page-specific components

### Shared plum page hero

About, Contact, Our Rooms, Gym, Swimming Pool, and accommodation pages use plum page heroes rather than the Home’s photo hero. Their lower edge is an uneven shallow white paint/brush sweep with fine streaks at the far sides. It is a necessary reusable asset/component, not a plain diagonal CSS clip.

- About: 550px plum opening, large left-aligned `Welcome to` (muted) / `Rivana Residence` (white) and right-side eyebrow/body copy.
- Contact / Our Rooms: 500px plum title treatment. Contact title is centered “Contact Us”; Our Rooms includes centered eyebrow “Living your experience,” title, and overlapping booking card.
- Gym: 641px hero, large stacked left title `Our` / `Gym` with more generous 160px top and 300px bottom spacing.
- Swimming Pool: similar 606px hero, stacked `Our` / `Swimming Pool`.
- Room detail: plum information/gallery field. Desktop headline is left (`Studio With` / `Balcony Room`), starting below header; `from` and price align right. Two horizontal rules enclose a four-column facts row.

### Image galleries and amenity grids

- Gym and Pool: hero followed by a wide feature image, short quote and opening-hours block, then a 600px image carousel/gallery with left/right arrows. Source content uses five images per amenity: mixed landscape and portrait crops.
- Room page: entire 3-column photo masonry/grid sits on plum. Desktop image columns are around 353px with approx. 40px gaps inside a 1140px container; every image is a 3:2 crop. On mobile it turns into one 350px column with 20px side gutters and about 40px vertical gaps.
- Our Rooms and room details both reuse the plum “Our Amenities” band and 3-item amenity grid: Wellness & Spa, Fitness Center, Swimming Pool.

### Contact map

The Contact page embeds a wide map directly below its plum title hero. The live inspection displayed the Google Maps “This page can't load Google Maps correctly” development/API error, so a valid final map appearance cannot be inferred. Preserve this as an explicitly configurable map/embed area; do not make an invented map styling decision part of the reference target.

## 4. Animations and interactions

- **Page / loader:** a centered Rivana favicon-style mark appears during the dark page loader before content becomes available.
- **Entrance motion:** `init-smoove` elements use a **0.8s cubic-bezier(0.23, 1, 0.32, 1)** transition with staggered observed delays of 0.15s, 0.25s, 0.35s, and 0.45s. Use upward reveal/fade-in with occasional per-character/word stagger on major headings. The in-progress Pool and room hero captures visibly showed letters resolving left-to-right.
- **Section reveal:** image/cards and textual columns enter as the section approaches the viewport; no perpetual decorative motion was observed.
- **Image behavior:** retain natural static photo presentation; moderate crop/cover and an optional subtle linked-image zoom/dim on hover. Do not introduce parallax unless subsequently verified—the inspected elements identify background parallax as false.
- **Header:** fixed header transitions between transparent/white modes on scroll. Logo and header height visibly reduce; use a 200–400ms smooth transition.
- **Drawer:** off-canvas mobile menu slides horizontally over 400ms.
- **Desktop submenu:** fades and translates `translateY(-15px)` to rest in 0.2s; large soft shadow.
- **Gallery:** Gym/Pool arrows change image state; previous can be disabled at the first slide. Room gallery opens linked images as lightbox targets if implementing interaction parity.
- **Forms/calendar:** date inputs trigger a date picker; selected/hovered availability uses a soft green (`#89B63C` observed as booking plugin fallback) on the room calendar.

## 5. Responsive behavior

| Area | Desktop (1280 reference) | Mobile (390 reference) |
| --- | --- | --- |
| Content width | 1140px container, 70px gutters | 350px content, 20px gutters |
| Header | Center logo, split navigation | Compact fixed logo + hamburger |
| Hero title | 55–60px Marcellus, broad layouts | 31–34px, deliberately wraps into several lines |
| Search | Three-column horizontal white card | Vertically stacked fields and full-width button |
| Card/gallery grids | 2 columns room listing; 3 columns room gallery / Home cards | Single column, full content width |
| Contact form | Two-column white contact panel | Stack contact details above form |
| Footer | Three columns, lower legal row split | Stack columns/links, then legal content |
| Floating actions | Lower-right chat; scroll-to-top when applicable | Chat plus three persistent action pills at bottom |

Observed site breakpoints include `max-width: 1024px` and `max-width: 767px`; use 1024px for tablet collapse/spacing adjustments and 767px for phone layout/menu replacement. Preserve the wide hero and header breathing room on tablet rather than jumping straight to phone proportions.

## 6. Required assets

All listed URLs are live-reference assets and should be downloaded/licensed/replaced only with permission for the local study.

### Brand assets

- `Rivana-Residence-Logo.png` — 500×300 primary logo
- `Rivana-Residence-Sticky-Logo.png` — 500×300 compact/light-background logo
- `Rivana-Hotels-Favicon.png` — 512×512 favicon/loader mark
- White brush-stroke/curved separator asset, or a faithful locally drawn SVG after collecting it from the reference (required between plum and canvas sections)

### Home / about imagery

- Home hero: `Rivana-Residence-Home-011.jpg`
- About exterior: `Rivana-Residence-Exterior-3.jpg` (748×1330)
- Lifestyle background: `couple-pending-time-by-secluded-swimming-pool-AAYW37A.jpg`

### Room imagery

- Listing: `Rivana-Superior-Twin-Room-1-700x466.jpg`, `Rivana-Superior-Room-700x466.jpg`, `Rivana-Superior-Room-2-700x466.jpg`
- Studio with Balcony gallery: `Rivana-Superior-Twin-Room-700x466.jpg` through `Rivana-Superior-Twin-Room-8-700x466.jpg` (nine visible gallery images total, each 700×466)
- Equivalent distinct gallery sets for Studio With Pool View and Deluxe Double Room are needed; obtain them from each live room page rather than reusing the balcony set.

### Gym imagery

- `Rivana-Residence-Gym-1536x864.jpg`
- `Rivana-Residence-Gym-02-1024x576.jpg`
- `Rivana-Residence-Gym-04-731x1024.jpg`
- `Rivana-Residence-Gym-03-1024x576.jpg`
- `Rivana-Residence-Gym-5-1024x1024.jpg`

### Pool imagery

- `Rivana-Residence-Swimming-Pool-01-1536x1026.jpg`
- `Rivana-Residence-Swimming-Pool-02-576x1024.jpg`
- `Rivana-Residence-Swimming-Pool-1024x576.jpg`
- `Rivana-Residence-Swimming-Pool-04-747x1024.jpg`
- `Rivana-Residence-Swimming-Pool-03-1024x684.jpg`

### Icons and integrations

- Hamburger, chevron, chat, calendar, phone, WhatsApp, back-to-top arrow, carousel arrows, and social brand icons.
- Local/non-submitting contact and booking state data for the study; no live API credentials.
- Optional configurable map placeholder, not a copied API-error state.

## 7. Page-by-page structure

### Home (`/`)

1. Fixed transparent header over full photo hero.
2. Approximately 648px darkened lobby/interior photo hero: 22px eyebrow, 55px centered white H1, overlapping search card.
3. White brand introduction section, roughly 584px: small crest icon, two-tone 60px `RIVANA` / `RESIDENCE`, intro paragraph, Learn More.
4. Plum `Our Rooms` title band (about 298px), then room carousel/grid (about 625px).
5. White `Our Amenities` title band (about 278px), then 3-across image service grid (Cafe, Gym, Swimming Pool; about 450px).
6. 700px full-bleed lifestyle photo panel with left overlay copy (`Rest well` muted / `Sleep well` dark) and Learn More.
7. Contact CTA and shared footer.

### About (`/about/`)

1. Fixed transparent header over 550px plum hero with brush separator.
2. Two-column welcome statement: title left; eyebrow and body right.
3. Exterior/property image + quote/content composition (source image is portrait exterior).
4. Shared `Our Rooms` plum band and room carousel.
5. Shared contact CTA and footer.

### Contact (`/contact/`)

1. Fixed transparent header over 500px plum hero with centered `Contact Us` and brush separator.
2. Full-width map/embed panel overlapping/beneath the hero curve.
3. Narrow text bridge including `Stay with us in comfort`, `Egypt`, and descriptive hospitality copy.
4. Shared contact CTA (the page's functional contact form) and footer.

### Gym (`/gym/`)

1. 641px plum hero, left stacked `Our` / `Gym`, brush separator.
2. Wide gym feature photo.
3. Quote and `Opening Hours` (06:00 am – 22:30 pm) information block.
4. Arrow-controlled gym image carousel/gallery.
5. Shared contact CTA and footer.

### Swimming Pool (`/swimming-pool/`)

1. 606px plum hero, left stacked `Our` / `Swimming Pool`, brush separator.
2. Wide pool feature photo.
3. Quote and `Opening Hours` information block.
4. Arrow-controlled pool image carousel/gallery.
5. Shared contact CTA and footer.

### Our Rooms (`/our-rooms/`)

1. 500px plum hero with eyebrow `Living your experience`, centered `Our Rooms`, brush separator.
2. Overlapping desktop search card.
3. Two-column room type listing: Studio With Balcony ($70), Studio With Pool View ($65), Deluxe Double ($60), including size/occupancy metadata and Book Now.
4. Plum `Our Amenities` title and the 3-item amenity service grid.
5. Shared contact CTA and footer.

### Individual accommodation pages (`/accommodation/.../`)

Use a shared template with per-room title, rate, attribute data, and gallery assets.

1. Fixed header over plum detail field.
2. Left room title; right `from` + price. Horizontal rule.
3. Four detail cells: Size, Bed, Capacity, View. Observed Studio With Balcony values: **55 M2**, **2 Twin Bed**, **2 Adults 1 Child**, **City View**. Horizontal rule.
4. Three-column plum photo gallery (one column mobile). The Studio With Balcony gallery has nine photos.
5. White booking section with `Ready to book`, availability calendar, required date fields, guests, and booking action.
6. Shared plum `Our Amenities` + service grid.
7. Shared contact CTA and footer.

## Fidelity guardrails for implementation

- Recreate the visual hierarchy, empty space, brush boundary, photos, and motion timings before adding extra effects.
- Keep borders square, shadow usage sparse, and color palette narrow.
- Do not replace the two-tone editorial Marcellus type with a geometric sans; this would materially change the design.
- Do not treat the live map error as intentional visual design.
- Keep all booking/contact actions local and non-submitting in the reference project unless later explicitly requested.
