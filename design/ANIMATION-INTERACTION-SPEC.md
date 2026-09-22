# Rivana Residence — animation and interaction specification

**Scope and confidence.** This document is based on live inspection of Home, Gym, Swimming Pool, and Studio With Balcony Room at desktop and 390px mobile. Values come from computed live styles, element settings, and observed interaction states. Where the loaded theme contains an animation capability but the inspected Rivana pages do not use it, it is explicitly marked **not confirmed for Rivana**.

## Motion constants confirmed in the live site

| Name | Value | Confirmed use |
| --- | --- | --- |
| Primary reveal easing | `cubic-bezier(0.23, 1, 0.32, 1)` | all `init-smoove` scroll/page reveals |
| Primary reveal durations | `800ms`, `1200ms` | contextual content and heading reveals |
| Reveal delays | `150ms`, `200ms`, `250ms`, `350ms`, `450ms`, `650ms` | staggered content sequences |
| Hero character duration | `800ms` | Home animated H1; analogous split titles on internal heroes |
| Hero character stagger | 30ms per character, beginning at 150ms | Home H1’s live per-character inline delays |
| Menu drawer | `400ms ease` | mobile drawer and pushed page wrapper |
| Sticky header mode | `200ms ease-out` | initial header out, sticky header in |
| Nav underline / submenu | `200ms ease-out` | desktop menu interactions |
| Amenity card base change | `550ms` | overlay and shadow on desktop hover |
| Amenity text hover | `650ms cubic-bezier(0.05, 0.2, 0.1, 1)` | title/content movement on desktop hover |
| Carousel arrows | `300ms cubic-bezier(0.645, 0.045, 0.355, 1)` | Gym/Pool next/previous arrow position and opacity |
| Gallery image load | `400ms` opacity | Flickity lazy-loaded images |

## Page-load sequence

### 1. Full-screen loader

| Field | Observation |
| --- | --- |
| Trigger | Each initial page load before `body.loaded` is applied. |
| Element | `#loftloader-wrapper`, dark full-screen loader field, centered Rivana favicon image. |
| Initial state | Fixed viewport overlay (`z-index: 999999`); black loader sheet at 95% opacity; centered image loader. The configured loader is the image-loading variation with the Rivana favicon and a 100px loading area. |
| Final state | Loader image fades to opacity 0, loader sheet fades out, then wrapper is made non-interactive and moved off-screen. |
| Duration | Loader image: `300ms ease-out` after page-loaded class. Loader sheet: `700ms cubic-bezier(0.645, 0.045, 0.355, 1)` after a `300ms` delay. Wrapper removal is delayed—opacity at 1s and horizontal removal at 2s. |
| Delay | 300ms for sheet transition; 1s / 2s cleanup delays as above. |
| Easing | `ease-out` image; `cubic-bezier(0.645, 0.045, 0.355, 1)` sheet. |
| Transform | Wrapper ends at `translateX(-200vw)`; fade-sheet itself changes opacity, not position, in this Rivana configuration. |
| Opacity | Loader sheet `.95 → 0`; loader image `1 → 0`; wrapper `1 → 0`. |
| Responsive differences | None confirmed. |
| Notes | The loader’s internal image-fill animation is configured as a repeating `6s linear` animation while the loader remains open. Its full visual cycle was not reliably captured, so only the configuration—not a reconstructed fill choreography—is specified. |

## Hero and text animations

### 2. Home hero headline: per-character reveal

| Field | Observation |
| --- | --- |
| Trigger | Page load, after the headline is split into character spans. |
| Element | Home H1: “LUXURY IS A STATE OF MIND, AND HERE, IT’S OUR REALITY.” |
| Initial state | Each `.blast` span has `opacity: 0` and the Home’s `transition-right` setting gives `transform: translateX(101%) translateY(0) translateZ(0)`. Character wrappers clip overflow. |
| Final state | Each span receives the visible state: `opacity: 1; transform: translateX(0) translateY(0) translateZ(0)`. |
| Duration | `800ms` each character. |
| Delay | First character observed at `150ms`; each following character advances by `30ms` (150, 180, 210…ms). The generic theme rule has a 1000ms default, but the live Home spans override it with these inline values. |
| Easing | **Not confirmed.** The live inline transition exposes duration/delay but not an explicit timing function; do not assume the scroll-reveal easing. |
| Transform | Horizontal right-to-center reveal (`translateX(101%) → 0`). |
| Opacity | `0 → 1` per character. |
| Responsive differences | Same character animation system is present on mobile. The text is 31px / 1.2 line-height at ≤767px, so the line breaks differ but the reveal logic remains. |

### 3. Internal hero and editorial split-title reveals

| Field | Observation |
| --- | --- |
| Trigger | Initial hero presence/page load. Seen on Pool and room-title captures while characters were mid-reveal. |
| Element | Page titles and large two-tone editorial headings built with `.themegoods-animated-text` and character spans. |
| Initial state | Same hidden character span system; direction class determines translation. Home is confirmed as `transition-right`; the exact direction class on every individual page heading was not collected. |
| Final state | Character spans resolve to neutral translation and full opacity. |
| Duration | `800ms` per character where inline styles were available. |
| Delay | Character staggering is confirmed on Home; exact internal-page initial/stagger values are **not confirmed**. |
| Easing | **Not confirmed** for character spans. |
| Transform | Directional character translation to neutral; the exact internal-page direction is **not confirmed** per title. |
| Opacity | `0 → 1`. |
| Responsive differences | Remains active in the page markup on mobile; headings are smaller and wrap more aggressively. |

### 4. Hero eyebrow and booking search entrance

| Field | Observation |
| --- | --- |
| Trigger | Page load in the Home hero. |
| Element | Home eyebrow (`Living your experience…`) and overlapping booking search block. |
| Initial state | Both use `init-smoove` opacity state. The eyebrow uses a 1200ms reveal with 200ms delay; booking search uses 1200ms with no observed delay. No positional transform is configured. |
| Final state | `opacity: 1; transform: none`. |
| Duration | `1200ms`. |
| Delay | Eyebrow `200ms`; booking search `0ms`. |
| Easing | `cubic-bezier(0.23, 1, 0.32, 1)`. |
| Transform | None. |
| Opacity | `0 → 1`. |
| Responsive differences | Their content/layout changes on mobile; this entrance system is configured to disable at breakpoint value `769` (see responsive motion). |

## Scroll-triggered section reveals

The live site uses an `init-smoove` / `smooved` class transition system. Elements begin `opacity: 0` with their configured transform. When the scroll observer marks them `smooved`, they settle to `opacity: 1; transform: none`.

### 5. Neutral fade reveal

| Field | Observation |
| --- | --- |
| Trigger | Element approaches the viewport; exact observer threshold is **not confirmed**. |
| Element | Section eyebrows and large title groups, e.g. Home “Our Rooms” / “Our Amenities” heading groups. |
| Initial state | `opacity: 0; transform: none`. |
| Final state | `opacity: 1; transform: none`. |
| Duration | `1200ms`. |
| Delay | Usually `200ms`. |
| Easing | `cubic-bezier(0.23, 1, 0.32, 1)`. |
| Transform | No movement; pure fade. |
| Opacity | `0 → 1`. |
| Responsive differences | Theme data disables this Smoove behavior at `769`; on phone widths content should render without waiting for the reveal. |

### 6. Scale-up image / brand-mark reveal

| Field | Observation |
| --- | --- |
| Trigger | Scroll into the Home brand-introduction section. |
| Element | The centered Rivana emblem/image in the Home introduction. |
| Initial state | `opacity: 0; transform: scale(0.2)`; transform origin 50% / 50%. |
| Final state | `opacity: 1; transform: scale(1)`. |
| Duration | `800ms`. |
| Delay | `250ms`. |
| Easing | `cubic-bezier(0.23, 1, 0.32, 1)`. |
| Transform | `scale(.2) → scale(1)`. |
| Opacity | `0 → 1`. |
| Responsive differences | Smoove is disabled at `769`; no phone-specific replacement motion confirmed. |

### 7. Upward copy and button reveal

| Field | Observation |
| --- | --- |
| Trigger | Scroll into a content group. |
| Element | Intro paragraphs, “Learn More” actions, and comparable lower-page copy/actions. |
| Initial state | `opacity: 0; transform: translateY(30px)`. |
| Final state | `opacity: 1; transform: translateY(0)`. |
| Duration | `800ms`. |
| Delay | Copy commonly `450ms`; following action commonly `650ms`. |
| Easing | `cubic-bezier(0.23, 1, 0.32, 1)`. |
| Transform | `translateY(30px) → translateY(0)`. |
| Opacity | `0 → 1`. |
| Responsive differences | Disabled at `769` by the inspected widget settings. |

### 8. Horizontal action / contact-detail reveal

| Field | Observation |
| --- | --- |
| Trigger | Scroll into the relevant section, including Home section controls and contact CTA fields. |
| Element | “View all / Learn more” button widgets and contact-detail columns. |
| Initial state | Right-entry widgets use `opacity: 0; transform: translateX(30px)`. Contact-detail content uses left-entry `opacity: 0; transform: translateX(-30px)`. |
| Final state | `opacity: 1; transform: translateX(0)`. |
| Duration | `800ms`. |
| Delay | Buttons: `650ms`. Contact group: `150ms`, then adjacent fields `250ms` / `350ms` in a stagger. |
| Easing | `cubic-bezier(0.23, 1, 0.32, 1)`. |
| Transform | `translateX(±30px) → 0`. |
| Opacity | `0 → 1`. |
| Responsive differences | Disabled at `769` by the inspected widget settings. |

### 9. Carousel/container fade reveal

| Field | Observation |
| --- | --- |
| Trigger | Scroll into room-carousel sections. |
| Element | Home accommodation carousel and equivalent section containers. |
| Initial state | `opacity: 0; transform: none`. |
| Final state | `opacity: 1; transform: none`. |
| Duration | `800ms`. |
| Delay | `250ms`. |
| Easing | `cubic-bezier(0.23, 1, 0.32, 1)`. |
| Transform | None. |
| Opacity | `0 → 1`. |
| Responsive differences | Disabled at `769` by the inspected widget settings. |

### 10. Fade-out-on-scroll hero eyebrow

| Field | Observation |
| --- | --- |
| Trigger | Scrolling away from the Home hero. |
| Element | Home hero eyebrow widget only; its live widget setting enables fade-out animation. |
| Initial state | Visible after its entrance reveal. |
| Final state | Fades while moving away from the viewport. |
| Duration / delay / easing | **Not confirmed.** The live widget exposes fade-out enabled, direction `up`, velocity `0.7`; it does not expose an implementation duration/timing curve in computed styles. |
| Transform | Upward direction is configured; exact displacement is **not confirmed**. |
| Opacity | Fades down as scroll progresses; exact range is **not confirmed**. |
| Responsive differences | **Not confirmed**; the entrance system itself is disabled at the 769 breakpoint. |

## Hover and state transitions

### 11. Desktop navigation underline and active link

| Field | Observation |
| --- | --- |
| Trigger | Pointer hover or current-page state on a desktop navigation link. |
| Element | Header nav links, including “Our Rooms.” |
| Initial state | Pseudo-element is a 1px line at full link width with `transform: scaleX(0)`; transform origin is right/top. |
| Final state | `scaleX(1)` with transform origin left/top. Link color uses gold for the current item; hover color changes are subtle/dark depending on header state. |
| Duration | `200ms`. |
| Delay | None. |
| Easing | `ease-out` for underline; link padding transition is `300ms` (timing not explicitly declared). |
| Transform | `scaleX(0) → scaleX(1)`. |
| Opacity | No opacity animation confirmed. |
| Responsive differences | Desktop nav is hidden at ≤767px; this interaction does not transfer to the drawer. |

### 12. Desktop room submenu

| Field | Observation |
| --- | --- |
| Trigger | Hovering the desktop “Our Rooms” parent item. |
| Element | 200px white submenu. |
| Initial state | `opacity: 0`, `height: 0`, `overflow: hidden`, `z-index: -1`, `transform: translateY(-15px)`. |
| Final state | `opacity: 1`, natural height, visible overflow, `z-index: 9`, `transform: translateY(0)`. |
| Duration | `200ms`. |
| Delay | None. |
| Easing | `ease-out`. |
| Transform | `translateY(-15px) → 0`. |
| Opacity | `0 → 1`. |
| Responsive differences | Not present in the sampled mobile drawer; mobile lists only the top-level routes. |

### 13. Amenity/service image card hover

| Field | Observation |
| --- | --- |
| Trigger | Pointer hover on a Home amenity card (Cafe, Gym, Swimming Pool). |
| Element | `.service-grid-wrapper`, title group, and description layer. |
| Initial state | 450px-tall desktop photo card; gradient/dark overlay at opacity `.6`; shadow absent; description hidden at `opacity: 0; transform: translateY(20px)`. |
| Final state | Card gets `0 25px 55px rgb(0 0 0 / .22)` shadow; overlay opacity reaches `1`; header/title group shifts upward by `translateY(-90px)`; description becomes visible at `opacity: 1; transform: translateY(0)`. |
| Duration | Card/overlay/shadow `550ms`. Description final transition `650ms`; header declared `650ms`. |
| Delay | Description final reveal `150ms`; header delay **not confirmed**. |
| Easing | Text: `cubic-bezier(0.05, 0.2, 0.1, 1)`. Card base transition has duration only (`550ms`), so its easing is **not confirmed**. |
| Transform | Header `translateY(0) → -90px`; description `translateY(20px) → 0`. |
| Opacity | Overlay `.6 → 1`; description `0 → 1`. |
| Responsive differences | At ≤767px, the hover description is explicitly `display: none`; keep content visible/readable in the static mobile layout and do not depend on hover. |

### 14. Primary buttons, text links, and form fields

| Field | Observation |
| --- | --- |
| Trigger | Pointer hover/focus. |
| Element | Plum action buttons, linked media, and underline-style inputs. |
| Initial state | Plum button with white text; linked media text link; dark gray input underline. |
| Final state | Buttons retain white text; theme transition changes color/background/opacity. Linked media anchors transition color/background. Input transition changes border color. No scale, lift, or radius morph was confirmed for these core controls. |
| Duration | Button: color `200ms linear`, background `300ms linear`, opacity `200ms linear`. Linked media anchor: color `200ms linear`, background `100ms linear`. Inputs: border color `300ms linear`. |
| Delay | None. |
| Easing | Linear (as above). |
| Transform | None confirmed. |
| Opacity | Button opacity property can transition; exact hover target is **not confirmed**. |
| Responsive differences | No confirmed difference. |

### 15. Room-card image scaling / hover overlay

| Field | Observation |
| --- | --- |
| Trigger | Pointer hover on Home room cards or Our Rooms listing cards. |
| Element | Accommodation card imagery. |
| Initial / final state / duration / delay / easing / transform / opacity | **Not confirmed.** The inspected live card image and link containers advertise generic `transition: all` / link color-background transitions, but no page-specific image-scale or overlay rule was found. Do not add a scale effect solely on the basis of the broader theme’s capabilities. |
| Responsive differences | Not confirmed. |

## Header, fixed, and sticky interactions

### 16. Two-layer header swap on scroll

| Field | Observation |
| --- | --- |
| Trigger | Scroll away from the top. |
| Element | Initial `#elementor_header` and compact `#elementor_sticky_header`; both are `position: fixed`. |
| Initial state | Initial transparent header visible: 162px high at desktop, primary logo about 220×132px; sticky header `opacity: 0`, `z-index: -1`, `transform: translateY(-140px)`. |
| Final state | Initial header receives `scroll` and fades away; sticky header receives `visible scroll`, is 107px high with an `rgba(255,255,255,.93)` inner section and a 145×87px sticky logo. |
| Duration | `200ms`. |
| Delay | None. |
| Easing | `ease-out`. |
| Transform | Sticky header `translateY(-140px) → translateY(0)`. |
| Opacity | Initial header visible → 0; sticky header `0 → 1`. |
| Responsive differences | Mobile keeps fixed header behavior but uses logo + hamburger rather than split nav. Exact mobile sticky-layer swap values were not separately measured. |

### 17. Chat, back-to-top, and mobile quick actions

| Field | Observation |
| --- | --- |
| Trigger | Persistent UI. Back-to-top appears after scroll; chat is fixed lower-right. At mobile widths, Book Now / Call us / WhatsApp appear persistently along the bottom. |
| Element | Gold circular chat, gold square up-arrow, and gold mobile action pills. |
| Initial/final / duration / delay / easing / transform / opacity | **Not confirmed** for their entrance/exits. Their fixed/persistent positioning is confirmed; no reliable style timing was captured for their appearance. |
| Responsive differences | Three quick actions only observed at mobile width. |

## Carousels, galleries, and image state changes

### 18. Home accommodation carousel

| Field | Observation |
| --- | --- |
| Trigger | Drag/swipe or any existing carousel controls; no autoplay. |
| Element | Home `owl-carousel` room row. |
| Initial state | Two visible items at desktop; third room follows. Data configuration: `data-items="2"`, `data-pagination="0"`, `data-autoplay="0"`, `data-timer="8000"`. |
| Final state | Carousel translates to the next room set. |
| Duration / delay / easing | **Not confirmed.** The loaded Owl carousel’s movement configuration was not exposed in the inspected DOM/CSS. |
| Transform / opacity | Horizontal stage translation is expected but exact live transform values and fade use are **not confirmed**. |
| Responsive differences | Mobile layout shows stacked/one-column room presentation; the exact mobile carousel interaction is **not confirmed**. |

### 19. Gym and Swimming Pool horizontal gallery

| Field | Observation |
| --- | --- |
| Trigger | Next/Previous buttons or drag. |
| Element | `.tg_horizontal_gallery_wrapper` built with Flickity. |
| Initial state | 600px-tall horizontal viewport; no autoplay, no loop, navigation on, pagination off, parallax off, fullscreen off. At first slide Previous is disabled at opacity `.3`; Next is opacity `.75`. |
| Final state | Flickity slider changes horizontal `translateX` to the selected image; clicked Next enabled Previous and the observed slider settled from `translateX(0)` to roughly `translateX(-640px)` for the next selection in the 1280px capture. |
| Duration | Gallery slide duration/easing **not confirmed** (handled by Flickity runtime, not exposed as a usable CSS transition). Arrow controls use `300ms cubic-bezier(0.645, 0.045, 0.355, 1)`. |
| Delay | None for arrow state. |
| Easing | Arrow state as above; slide movement **not confirmed**. |
| Transform | Slider uses horizontal `translateX`; right arrow hover moves `right: 40px → 30px`, left arrow moves `left: 40px → 30px`. |
| Opacity | Normal arrows `.75`; hover `1`; disabled `.3`. Gallery images lazy-load `opacity: 0 → 1` over `400ms`. |
| Responsive differences | Navigation buttons remain displayed at ≤767px. The source limits gallery images to `max-height: 300px` in relevant mobile gallery context. |

### 20. Room-detail image gallery and lightbox

| Field | Observation |
| --- | --- |
| Trigger | Image link activation. |
| Element | Nine linked room images on the Studio With Balcony Room page. |
| Initial / final state | Images are static 3-column gallery tiles desktop, 1-column mobile. Links target full images. |
| Duration / delay / easing / transform / opacity | **Not confirmed.** The lightbox capability is present in the theme markup, but the actual open/close motion was not safely inspected. Do not prescribe a lightbox animation based on unverified theme styles. |
| Responsive differences | Grid becomes one column; no transition difference confirmed. |

## Image-reveal capabilities not confirmed for Rivana pages

The loaded theme defines image-mask effects, but no inspected Rivana image widget had the activating classes. Do **not** implement these as default Rivana behavior without a new confirmation.

| Capability in loaded theme | Why it is not specified as a Rivana animation |
| --- | --- |
| White mask wipe (`scaleY(1 → 0)` or `scaleX(1 → 0)`) | CSS exists, but no inspected Rivana image used the slide animation class. |
| Zoom-in reveal | Theme can animate image `scale(1.7 → 1)` plus a white border mask over 1s, but no inspected Rivana widget activated it. |
| Zoom-out reveal | Theme can animate image `scale(.4 → 1)` plus border-mask disappearance, but no inspected Rivana widget activated it. |
| Parallax/background motion | Inspected sections explicitly declare background parallax false. |
| Infinite/mouse parallax | Inspected Smoove widgets explicitly set these options false. |

## Responsive motion policy derived from the source

- The principal Smoove widgets carry `hoteller_ext_smoove_disable: "769"`. Treat **≤768px as no scroll-reveal animation**: render content in its final visible state rather than delaying it.
- The mobile menu is the principal phone motion: drawer `translateX(-400px) → 0` while `#wrapper` is pushed from x≈-30px to `translateX(300px)`, yielding observed page content at x≈270px. Both use `transform 400ms ease`.
- Desktop-only hover interactions must not carry essential content to mobile. The amenity descriptions are explicitly hidden on mobile hover.
- Use `prefers-reduced-motion` to suppress all reveal transforms and character staggering, keeping the end state visible; this was not provided by the live source but is an implementation accessibility requirement, not a claim about the reference.

## Implementation fidelity rules

1. Build the Smoove reveal variants exactly—neutral fade, scale `.2`, ±30px horizontal, and +30px vertical—rather than replacing them with a single universal slide-up.
2. Keep the 800ms / 1200ms distinction and the actual delay ladder. The stagger is part of the design’s measured calm pace.
3. Do not add generic image zooms to every card; that interaction is not confirmed on Rivana’s room cards.
4. Preserve the pushed-content mobile drawer rather than using an unrelated modal fade.
5. Keep carousel autoplay off. Home room carousel and Gym/Pool galleries are configured for manual navigation.
6. Where this specification says **not confirmed**, use a restrained static/local interaction until a further live inspection establishes the behavior.
