# 0007. M10 guest booking journey and first party analytics

**Date**: 2026-11-26
**Status**: Proposed (spec and task breakdown approved by the owner on 2026-11-26; becomes Accepted when the milestone is accepted)

## Summary

This is the build spec for milestone M10. Guests can now book on their branch's website from start to finish: search, pick one or more units, verify their contact, add extras and a coupon, choose how to pay, review the price with VAT, and submit. They can later open their booking, ask to cancel, or change it. The server stays the only source of prices and availability; the browser only shows what the API returns.

M10 also adds first party website analytics (ADR 029): a tiny beacon (a small script that reports page views) plus funnel steps (the booking steps a visitor reaches) recorded by the server, with no cookie and no personal data. Almost every backend rule already exists from M6 to M9, so M10 is mostly screens, one typed API client, and one small analytics module.

## Context

Brief: [m10-guest-booking-journey.md](../delivery/milestones/m10-guest-booking-journey.md). Binding decisions: ADR [009](../adr/009-server-components.md) (Server Components by default), [012](../adr/012-motion-library.md) (motion), [024](../adr/024-immediate-confirmation.md) (confirmed only when committed), [025](../adr/025-paymob-online-payment.md) (reserve, then hosted checkout; flow only), [027](../adr/027-booking-price-composition.md) (price order, server quote), [029](../adr/029-first-party-site-analytics.md) (analytics; accepted at M10-T0a planning), [030](../adr/030-provider-neutral-integrations.md) (no provider named in the interface), [031](../adr/031-email-verification-fallback.md) (email verification, amended by Q-100). Requirements: US-G1 to US-G7 and US-G6a, FR-ANL, FR-GCHG, GC-1 to GC-6, SV-5. API: P5, P6, P7, P9, P10, P11, G1 to G6 in [api-contracts.md](../api/api-contracts.md). Frontend design: [booking-and-operations-ui.md](../frontend/booking-and-operations-ui.md), [route-map.md](../frontend/route-map.md), [design-system.md](../frontend/design-system.md), [component-architecture.md](../frontend/component-architecture.md). Builds on specs [0005](./0005-m8-reservations.md) and [0006](./0006-m9-payments-and-cancellations.md).

The forces are honesty and privacy more than new business logic. A guest must never see "Confirmed" unless the database says `CONFIRMED`. The browser must never compute a total or send one that the server did not quote. A verification token or manage token must never land in a URL, a log, or an analytics event. Every step must work by keyboard, pass axe, fit 320 px, and keep 44 px touch targets. Public pages must stay inside the 260 KB script gate ([performance.md](../frontend/performance.md)).

Analytics must count visitors and funnel steps without a cookie, without storing an IP, and without any name, phone, email, reference, or token (Q-86, Q-87). The anonymous session id lives only in the browser's `sessionStorage`, so the server cannot see it unless the browser sends it. The search page is a plain GET form that must work without JavaScript, and online bookings are confirmed later by the payment callback, which never sees the browser. Both facts shape how the funnel is recorded.

Blocking questions: none open. Q-05 is decided ("VAT (n%)" with the Admin's rate). Q-22, Q-30, Q-64 need approved text only before online booking is switched on (M15); M10 ships clearly marked placeholder copy that `npm run audit:content` flags as a launch blocker.

### Decision provenance

Owner answers given while drafting this spec (2026-11-26):

| # | Question | Answer |
| --- | --- | --- |
| 1 | How P5, P6, P9, P10 receive the analytics session id | One optional request header, `Rivana-Analytics-Session`, sent by the typed client. Bodies unchanged |
| 2 | How the server rendered search page counts the search step | Split: the server records a session less `SEARCH` event (outcome and stay dates, for unmet demand); the page's beacon sends `STEP_VIEW` step `SEARCH`, which counts funnel step 3 |
| 3 | How the online confirmation finds the session | Nullable `Reservation.analyticsSessionId`, written at P7 for online bookings only, cleared when the payment resolves |
| 4 | Step layout | One page `/{branch}/book/details`, steps shown one at a time on the client |
| 5 | Carrying state | Selection (dates, units, guests per unit) in the details page query string; typed contact details in a `sessionStorage` draft for this tab; tokens in memory only |
| 6 | Email verification versus payment order | Email is offered only when the quote lists `ONLINE`; verifying by email locks the payment step to "Pay online now" |
| 7 | Time zone on the manage page | Additive `branch.timeZone` on the guest reservation response |
| 8 | Change booking prefill | One empty G5 preview; its `current` quote gives the listing slugs |
| 9 | API client response checking | Types only; responses are not re-parsed with zod in the browser |
| 10 | T4 risk | Raised from Medium to Critical |
| 11 | Book Now port | Approved: `BookingProvider.getLaunchDescriptor({ branchSlug, listingSlug? })` |
| 12 | `/{branch}/book` with online booking off | The contact explanation replaces the search form |
| 13 | Cross check gaps (16, see *Cross check*) | Apply every recommended resolution |

Owner decisions at M10-T0b planning (2026-11-26):

| # | Question | Answer |
| --- | --- | --- |
| 14 | Listing quotes and bookings | One row per distinct listing for `QUOTE` and `BOOKING_CONFIRMED`. A repeated `QUOTE`, `CODE_REQUESTED`, or `PHONE_VERIFIED` is skipped for 30 minutes (replaces once per UTC day) |
| 15 | Verification codes that count | Only purpose `BOOKING`; "My reservations" sign in codes record nothing |
| 16 | How the booking and payment code report | Optional listeners (`onSaved` on website booking, `onBookingConfirmed` on the payment callback), called after commit. A saved booking counts even when checkout then fails |
| 17 | When recording runs | After the response (`after()` from `next/server`); a command line job records directly |
| 18 | A payment confirmed after its hold expired | Not counted: expiry has already cleared the session id |
| 19 | Branch of the code steps | The daily totals give them the branch the session was last on |
| 20 | Daily totals | The dimensions, scopes (`*` whole site, branch, `''` outside), and counting rules in *Settled during M10-T0b* |

## Requirements

**User stories**: US-G1 (start booking at my branch), US-G2 (search), US-G3 (book and get confirmed, pay at hotel), US-G4 (pay online), US-G5 (extras and coupon), US-G6 (view booking, request cancellation), US-G6a (change my booking), US-G7 (My reservations), and FR-ANL (the hotel sees visits and the booking funnel). Text in [user-stories-and-acceptance-criteria.md](../requirements/user-stories-and-acceptance-criteria.md).

**Acceptance criteria** (the brief's criteria, verbatim in meaning, with the same numbers):

- **AC-1**: Results list only listings of the chosen branch that are available for the dates and party, with prices before VAT; a fully booked listing shows "not available for these dates".
- **AC-2**: A guest can book two units (for example one room and one apartment) in one booking.
- **AC-3**: Services and the cross sell are never added without an explicit guest action; removing them updates the total.
- **AC-4**: A valid coupon changes the quote and total; an invalid one shows its reason and leaves the total unchanged.
- **AC-5**: The review shows the VAT line and a total that equals the server quote; no total is computed in the browser.
- **AC-6**: Pay at hotel: the confirmation page appears only after a `201` with `CONFIRMED`. Online: the guest is sent to the hosted checkout; the return page says "Confirmed" only for `CONFIRMED` and never on a failed or pending payment.
- **AC-7**: Conflict (`INVENTORY_UNAVAILABLE`) returns the guest to results with an explanation; `PRICE_CHANGED` shows the new total and requires explicit acceptance.
- **AC-8**: Cancellation request works before the deadline and is replaced by contact details after it.
- **AC-9**: Every booking step passes axe with no serious or critical issues, works by keyboard, has no overflow at 320 px, and meets the 44 px touch target rule.
- **AC-10**: With online booking off for a branch, Book Now stays disabled and `/{branch}/book` explains how to book by contacting the hotel.
- **AC-11**: Visiting pages and walking the booking journey produces events for every funnel step with the same session id and no cookie; a confirmed booking is linked to its session; no stored event contains an IP, query string, name, phone, email, reference, or token; GPC stops recording; the rollup produces daily totals and deletes events older than 90 days; the public pages stay within the Lighthouse budgets.
- **AC-12**: A guest changes a pay at hotel booking (dates, units, extras with cars) and sees the new details at once; a paid booking with a new total shows "sent to the hotel for approval"; after the deadline the button is replaced by contact details; no total is computed in the browser.

Spec level criteria added by the decisions above (each traces to a brief criterion):

- **AC-13** (from AC-6, AC-11): no verification token, booking token, manage token, or guest session token ever appears in a URL query string, a server log, or an analytics event. The manage token travels only in the `#t=` fragment and `sessionStorage`.
- **AC-14** (from AC-9, Q-100): email verification is offered only when the current quote's `paymentMethods` contains `ONLINE` and email codes are available for the branch; after an email verification the payment step offers only online payment and says why.

## Options considered

### Option 1: Client side single page app for the whole journey

Every step, including search and results, renders in the browser from the REST API through the typed client. One state store holds the booking.

**Pros**:
- One rendering model; every API call naturally carries the analytics header.
- Simple to reason about state.

**Cons**:
- Search and results need JavaScript, which breaks the brief's "plain GET form that works without JavaScript" and hurts SEO and first paint (ADR 009).
- Larger client bundles on public pages, against the script budget.

### Option 2: Server rendered search and results, one client island for the booking steps (chosen)

Search and results are Server Components that call the same application use case as P5. The selection moves to `/{branch}/book/details` in the query string. That page is server rendered for the frame (selection, branch setup, deadline, consent versions) and hosts one client island that walks the steps and calls P6, P9, P10, and P7 through the typed client. Manage, My reservations, payment return, and confirmation are client pages that read tokens from the fragment or `sessionStorage`.

**Pros**:
- Search works without JavaScript, is shareable, and costs no client script.
- The server computes everything a guest must trust (availability, deadline, readiness) and the client never holds a price rule.
- Tokens stay in memory or `sessionStorage`, never in URLs.

**Cons**:
- Two rendering models in one journey; the server search page cannot see the analytics session id, so the search step is split between a server event and a beacon event.

### Option 3: Server Actions for every step

Each step posts to a Server Action, which calls the use cases.

**Pros**:
- Works without JavaScript for every step.

**Cons**:
- AGENTS.md forbids Server Actions replacing the reservation REST API; it would duplicate idempotency, rate limiting, and error mapping already built into P6, P7, P9, P10.

## Decision

**Chosen option**: Option 2: server rendered search and results, one client island for the booking steps.

The journey reuses every M6 to M9 endpoint unchanged except three additive contract changes (the analytics header, `analyticsSessionId` on P7, `branch.timeZone` on the guest reservation response), adds one migration and one endpoint for analytics, and keeps every price, availability, and readiness decision on the server.

**Implementation skills**: the project workflow skills (`develop` UI and logic tracks, `test`, `check`, `debug`, `sync` in `.claude/skills/` and `.agents/skills/`), plus the frontend skills listed in *Frontend skills for the build* below.

### Design system (binding for every UI task)

Every M10 screen is built with the project's own design system, [design-system.md](../frontend/design-system.md), and looks like the rest of the branch site. No skill, library, or generated design may replace it. In practice:

- **Look**: the "modern luxury hospitality" direction: warm white canvas, plum fields used sparingly, gold only for small accents and focus or active details, square corners, thin rules, sparse shadows. No glass panels, blur, heavy gradients, or rounded card stacks.
- **Type**: Marcellus for headings, Jost for body and form text, Oswald for compact action labels, through the `@theme` type tokens (for example `text-display-lg`).
- **Tokens and classes**: Tailwind utilities only, from the tokens in `src/app/globals.css` (`@theme` colours, fonts, radii, shadows, easing; `:root` layout tokens such as `--space-section`, container, gutter). Reuse the complete class lists in `src/presentation/site/classes.ts` (`button(...)`, `actionFill`, and the rest) and `src/presentation/design/classes.ts`; add new booking variants there as complete lists, never a parallel set of styles. No inline `style` except the data or motion values the doc allows; arbitrary values only for a one off composition.
- **Buttons**: the `primary`, `secondary`, `inverse`, `text`, and `booking-disabled` variants with every state (hover, focus visible, active, disabled, pending) and a 44 by 44 px minimum.
- **Forms**: persistent labels above controls, placeholders only as examples, 44 px controls with visible border and focus ring, help and error text next to the field, text plus colour for errors, required state announced, an error summary on the long details step.
- **Cards and layout**: listing cards in results reuse `src/presentation/site/cards.tsx` patterns and the `AccommodationBadge`; prices appear only from the server, before VAT during selection. 1140 px container, 20 px mobile gutters, single column on phones.
- **Motion**: only the existing `motion` reveal components through `MotionProvider` (ADR 012), respecting `prefers-reduced-motion`; motion never carries state alone.
- **Shell**: booking pages sit inside the branch layout (`SiteShell`, `SiteHeader`, `SiteFooter`); manage and My reservations use the brand shell used by the chooser at `/`.
- **Hooks**: tests and scripts find elements by `data-*` attributes, not class names.

The `/check review` of each UI task checks design system conformance alongside accessibility and the no client side price rule.

### Frontend skills for the build

The UI tasks (T2 to T10) are built with `/develop` on its UI track. These frontend skills are installed in the repo for both agents (`.claude/skills/` and `.agents/skills/`, listed in AGENTS.md and [agent-workflow.md](../engineering/agent-workflow.md#frontend-skills-added-2026-11-26-m10)). Project rules win over every skill, above all the design system section just above: no new style direction, no new dependencies, no third party script.

| Skill | Use it for | Tasks | Limits on Rivana |
| --- | --- | --- | --- |
| `ui-ux-pro-max` | UX and accessibility guidance while building each step: form patterns, error summaries, step indicators, touch targets, focus order, responsive layout at 320, 390, and 1280 px | T2 to T8b, T10 | Runs locally (Python, no network). Treat its results as suggestions; never send project data in a query. Keep the existing visual language, do not adopt a new style or palette |
| `vercel-react-best-practices` | React 19 and Next.js patterns for the client islands: small client boundaries, no request waterfalls, `useTransition` for re-quotes, avoiding needless re-renders | T1 to T8b, T10 | Read the Next.js 16 guides in `node_modules/next/dist/docs/` first (AGENTS.md); where they differ, the bundled docs win |
| `vercel-composition-patterns` | Composing the booking island: step components, `PriceSummary`, `ServicesPicker`, `CouponField` as slots instead of one component with many boolean props | T3 to T6, T8b | Follows [component-architecture.md](../frontend/component-architecture.md) (view models in, no Prisma records) |
| `frontend-design` | Craft and polish of the new booking screens so they match the existing editorial site | T2 to T8 | Only within the existing design system; ignore its push for a new bold aesthetic |
| `21st-ui-review` | Optional design QA of a finished step (accessibility, responsive behavior, consistency) before `/check review` | T2 to T8b | Ask the owner before the first run: the `21st` CLI is an external service. Never use `--fix` without review |
| `/check verify` (project) | Drive every path in a real browser, including keyboard only, and capture the evidence screenshots | Every UI task | Required by the workflow |

Not used on purpose: `21st-ui-build`, `21st-ui-explore`, `21st-ai`, `21st-cli-use` (they search or generate with the external 21st service and may install catalog components, which would add dependencies and send project context outside; the visual direction is already fixed by the design system), and `design-taste-frontend` (it proposes a new look).

## Rationale

The brief requires a search form that works without JavaScript and a server that is the only price authority (ADR 027), and ADR 009 asks for Server Components by default with small client islands. Option 2 meets both: the parts a guest must trust (availability, readiness, deadline) are computed on the server; the parts that need interaction (verification, re-quotes, submit with an idempotency key) run in one client island against the REST API that M8 and M9 already hardened. Option 1 breaks the no JavaScript search and the script budget; Option 3 breaks the AGENTS.md rule on Server Actions.

The analytics choices follow from Q-86: no cookie means the browser must send the session id. A header keeps the strict bodies of P6, P9, P10 untouched and avoids putting a tracking value in P5's query string. The search page split is the honest consequence of a server render that cannot see `sessionStorage`. The reservation column is cleared as soon as the payment resolves, so a session is tied to a booking only during the 15 minute hold.

The time zone and prefill choices keep contract changes minimal: one additive field where the docs already require branch local times, and none for prefill because G5 already returns the current quote.

## Feature design

### Routes and rendering

| Route | Rendering | What it does | Task |
| --- | --- | --- | --- |
| `/{branch}/book?checkIn&checkOut&adults&children&room` | Server page, GET form | Search form; results from `SearchPublicAvailability` (the P5 use case); availability limiter applied per client like P5; optional `room` highlights the listing from Book Now. With online booking off: the contact explanation replaces the form (AC-10) | T2, T9 |
| same page, basket | Small client island | Units per listing (up to `unitsAvailable`, at most 5 per booking, Q-69); subtotal from P6 | T3 |
| `/{branch}/book/details?checkIn&checkOut&u=…` | Server frame plus client island | Steps: 1 details, 2 verification, 3 extras and coupon, 4 payment choice, 5 review and submit | T4 to T6 |
| `/{branch}/book/confirmed` | Client page | Reads the P7 result from `sessionStorage`, then G1 with the manage token; "Confirmed" only for `CONFIRMED` | T6 |
| `/{branch}/book/payment` | Client page | Polls G1 with the manage token from `sessionStorage`; never reads the return query string | T7 |
| `/reservations/manage#t=…` | Client page, brand shell | G1, G2, change entry | T8, T8b |
| `/reservations/find` | Client page, brand shell | P9 and P10 with purpose `GUEST_SESSION`, then G3, G4 | T8, T8b |

`u` encodes units as `roomSlug.adults.children`, comma separated, repeated per unit (for example `u=deluxe.2.0,family-apartment.2.1`). It carries no personal data. The details page server frame parses it with the contract schemas and re-quotes it; an invalid or unavailable selection sends the guest back to results with the reason.

### Client state

| State | Where | Why |
| --- | --- | --- |
| Search inputs | URL query | Server rendered and shareable |
| Selection | URL query of the details page | Server can quote and compute the deadline |
| Name, email, phone, country, special requests | Component state plus a `sessionStorage` draft (`rivana.booking.draft.<branch>`), cleared after a `201` | Survives a reload in the same tab only |
| Verification id, booking token | Component state only | A token never persists |
| Chosen services, cars, flight details, coupon code, payment choice | Component state | Every change re-quotes through P6 |
| Current quote | Component state, replaced by each P6 response | The only total shown |
| Idempotency key | Component state, `crypto.randomUUID()` per submission content, kept across retries | One booking per submission (US-G3 AC4) |
| P7 result (reference, status, manage token) | `sessionStorage` (`rivana.booking.result`) | Read by the confirmed and payment return pages |
| Guest session token (My reservations) | Component state plus `sessionStorage`, dropped at its `expiresAt` | 30 minute session survives a reload in the tab |
| Analytics session id | `sessionStorage` (`rivana.analytics.session`), 128 bit random, hex | Created by the client helper in T1; absent under GPC or DNT |

### Typed API client (T1)

`src/presentation/api-client/` exports one function per endpoint (P5, P6, P7, P9, P10, P11, G1 to G6). Requests are typed with `z.input` of the schemas in `src/contracts/api/v1/` (client safe, D-7); responses use `z.output` types and are not re-parsed. Each call returns `{ ok: true, data, etag? } | { ok: false, problem }`, where `problem` follows [error-model.md](../api/error-model.md) (`code`, `title`, `fieldErrors`, `context`, `retryAfter`). It sets `Idempotency-Key`, `If-Match`, `Authorization: Bearer`, and `Rivana-Analytics-Session` where each endpoint needs it, uses same origin `fetch` with `cache: "no-store"`, and never logs a body or token. A network failure maps to a `NETWORK` problem the screens show with a retry.

### Booking steps (T4 to T6)

1. **Details**: full name, email, phone (country selector, E.164), optional special requests; field errors from `fieldErrors`, an error summary that takes focus.
2. **Verification**: channel choice among ready channels (WhatsApp; email only under AC-14); P9 then P10; attempts left from `context.attemptsLeft`; "Send again" enabled at `resendAvailableAt`; expiry at `expiresAt` keeps entered details; `403 PHONE_BLOCKED` shows the neutral contact message; `503` channel errors offer the other ready channel or the contact details. An email verified guest is told the hotel will confirm the phone on arrival.
3. **Extras and coupon**: active services with prices by unit (child price where set), nothing preselected; transfer with a car selector from 1 to `maxVehicles` (default 1) and optional flight number and arrival time; every change re-quotes; one coupon field, refusal reason from `COUPON_INVALID` in plain words.
4. **Payment choice**: options from the quote's `paymentMethods`; online hidden when absent; email verified guests see only online.
5. **Review and submit**: units, nights, per night breakdown, services, discount, subtotal, VAT with rate, total (all from the last quote); cancellation terms with the deadline in branch time, and the Q-64 note when the stay is already inside the 24 hour window; cross sell of unselected services that changes nothing until accepted (and then re-quotes); marketing opt in unticked (not shown for email verified bookings, which never record it, ADR 031); privacy consent required; placeholder legal text marked for the content audit. Submit calls P7 with `expectedTotal = quote.total`. Outcomes: `201 CONFIRMED` → confirmed page; `201 AWAITING_PAYMENT` → top level navigation to `checkoutUrl`; `409 INVENTORY_UNAVAILABLE` → back to results with an explanation; `409 PRICE_CHANGED` → call P6 again, show that quote, and require "Accept new total", which sets `expectedTotal` to the new P6 total and regenerates the idempotency key; `409 ONLINE_PAYMENT_REQUIRED` → switch to online; `429 BOOKING_LIMIT_REACHED` and `409 BRANCH_NOT_BOOKABLE` → contact details; `401 PHONE_NOT_VERIFIED` (token expired) → back to verification with details kept.

### Payment return (T7)

Reads the manage token from `sessionStorage`. Polls G1 every 2 seconds for 20 seconds, then every 5 seconds until 2 minutes. `CONFIRMED` → "Confirmed"; `PAYMENT_FAILED` → "Payment not completed", units released, with a link to search again; `AWAITING_PAYMENT` after polling stops → a waiting state with "Check again" and the manage link note. No token in `sessionStorage` (another tab or device) → a neutral message pointing to the confirmation message and My reservations.

### Manage, My reservations, cancellation (T8) and change (T8b)

- Manage reads `#t=` once, moves it to memory, and removes it from the address bar with `history.replaceState`. Shows status, payment status, details, price, cancellation request state (open, approved, rejected, refund pending, refund failed, completed, closed), change request state. "Request cancellation" (optional reason, confirm) only when `allowedActions` contains `REQUEST_CANCELLATION`; otherwise the branch contact details. An invalid link shows the neutral message and the My reservations path (US-G6 AC1).
- My reservations: phone (and email when the guest chooses the email channel) then code (P9, P10 with `GUEST_SESSION`), then G3 list and G4 detail with the same actions.
- Change booking appears only when `allowedActions` contains `CHANGE_RESERVATION`. It opens the same step components prefilled from an empty G5 preview (`{}`; its `current` quote gives stay, lines with `roomSlug` and occupancy, and services with cars) plus G1 (flight details from `price.services[].details`; `fullName`, `email`, `specialRequests` from `contact`, the only editable contact fields). Availability for new dates comes from P5. Preview (G5) shows what changed and old and new totals with VAT; confirm calls G6 with `If-Match` (the preview's `ETag`) and `expectedTotal = proposed.total`. `200` → "Your booking was changed"; `202` → "Sent to the hotel for approval"; `412` → reload and preview again; `409 PRICE_CHANGED` → show `context.quote.preview`; `403 CHANGE_NOT_ALLOWED` → contact details. Phone, branch, payment method, and coupon are read only.

### Book Now internal mode (T9)

An internal `BookingProvider` replaces `DisabledBookingProvider`, and the port takes `{ branchSlug, listingSlug? }` (owner approved 2026-11-26). Per branch it returns available `LINK` to `/{branch}/book` (with `room=<slug>` from a listing page) when the branch is bookable now: `onlineBookingEnabled`, a check-in time, and a usable verification channel (the same rule P7 uses, `verificationUsableForBranchNow`). Otherwise the existing honest disabled control with the contact message.

### Analytics (T0a, T0b, T10)

- **Domain** (`src/domain/analytics`): event names `PAGE_VIEW, STEP_VIEW, SEARCH, QUOTE, CODE_REQUESTED, PHONE_VERIFIED, BOOKING_SUBMITTED, BOOKING_CONFIRMED, CHECKOUT_REFUSED`; booking step names for `STEP_VIEW` (`SEARCH, DETAILS, VERIFY, EXTRAS, PAYMENT, REVIEW, CONFIRMED, PAYMENT_RETURN, MANAGE, FIND, CHANGE`); funnel step mapping 1 to 8 (FR-ANL); 30 minute session gap; furthest step, drop off, exit page; path normalization (route pattern, no query string, at most 200 characters); device class from the user agent; referrer reduced to its host; UTM values trimmed to 60 characters and stored only when approved; bot user agent list; opt out when `Sec-GPC: 1` or `DNT: 1`; prefetch detection (`Next-Router-Prefetch`, `Purpose: prefetch`, `Sec-Purpose: prefetch`).
- **Use cases** (`src/application/analytics`): `RecordSiteEvent` (P11), `RecordFunnelStep` (composition calls it after a use case returned, outside its transaction; errors are caught and logged without personal data), `RollUpSiteEvents` (daily totals per dimension, deletes raw events older than 90 days), `RotateAnalyticsSalt` (creates today's salt, deletes older ones; called lazily by recording and by the job).
- **Where steps are recorded** (implemented M10-T0b, wired in `src/composition`): P5 (`SEARCH`, outcome `NO_AVAILABILITY` with the stay dates when no listing is available; without a session id only that case is stored), P6 (`QUOTE` when a price is returned), P9 (`CODE_REQUESTED`) and P10 (`PHONE_VERIFIED`) for purpose `BOOKING` only, P7 (`BOOKING_SUBMITTED` for each newly saved booking, even if checkout then fails; `BOOKING_CONFIRMED` for pay at hotel; `CHECKOUT_REFUSED` with outcome `INVENTORY_UNAVAILABLE` or `PRICE_CHANGED`, counted for every such response). P7 never records a replay. `QUOTE` and `BOOKING_CONFIRMED` store one row per distinct listing. A repeated `QUOTE`, `CODE_REQUESTED`, or `PHONE_VERIFIED` for the same session, branch, and listing is skipped for 30 minutes (best effort under concurrency). Only the payment callback code, which `reconcile-payments` also uses, records `BOOKING_CONFIRMED` for online bookings; `expire-holds`, a failed payment, and expiry record nothing. Confirmation and failure clear `Reservation.analyticsSessionId`. The search page records a session less `SEARCH` event for unmet demand only (M10-T2). The beacon records `PAGE_VIEW` and `STEP_VIEW`.
- **Beacon** (T10): a client component of about 1 KB mounted in the public layouts (branch layout and brand shell); sends `PAGE_VIEW` on each navigation and `STEP_VIEW` when a booking step mounts, through `navigator.sendBeacon` (`text/plain`), `fetch` with `keepalive` as fallback; batches at most 20 events; does nothing under GPC or DNT; never blocks rendering; never sends query strings (UTM values are extracted into their own fields first, then the query is dropped).

### Settled by the cross check (2026-11-26)

These rules close the gaps found by the independent read (owner chose to apply every recommendation):

1. **Online confirmation event.** The confirming transaction reads `analyticsSessionId` while clearing it, and the payment use case tells its `onBookingConfirmed` listener after commit. Composition records `BOOKING_CONFIRMED` with the payment code's confirmation time, `visitorHash`, `device`, referrer, and UTM null, and `branchId` and listings from the reservation. Visitors are counted only from events that came with a browser request. A late success after expiry has no id left and is not counted.
2. **Funnel mapping** (pure, in `src/domain/analytics`): step 1 any `PAGE_VIEW` of a public page; step 2 `PAGE_VIEW` of `/{branch}/stay/[slug]` (the server resolves `roomId` from the slug); step 3 `STEP_VIEW` step `SEARCH` or a P5 `SEARCH` carrying the header; step 4 `QUOTE`; step 5 `CODE_REQUESTED`; step 6 `PHONE_VERIFIED`; step 7 `BOOKING_SUBMITTED`; step 8 `BOOKING_CONFIRMED`. Each step counts once per session in the rollup. Paths are stored as route patterns (`/{branch}/stay/[slug]`, `/reservations/manage`), never with a query string or fragment. The session less page `SEARCH` feeds unmet demand only. ADR 029 and FR-ANL wording ("the server records the search from P5") is amended to this when ADR 029 is accepted at T0a.
3. **Unmet demand.** The rollup's `UNMET_DATE` dimension expands `stayCheckIn` to `stayCheckOut` into nights, at most the public stay policy's maximum nights. Stay dates are not personal data.
4. **P11 rules.** `path` must start with `/` and be at most 200 characters (else `422`); `STEP_VIEW` requires `step` from the fixed list and `PAGE_VIEW` refuses one; a request whose `Sec-Fetch-Site` is not `same-origin` (or, without that header, whose `Origin` is not the app origin) is dropped with `204`. The client key comes from the existing helper in `src/composition/http.ts`. Each tab has its own session id (`sessionStorage`); a confirmation opened in another tab starts a new session, a documented limit. The rollup also splits one id into sessions at gaps of 30 minutes or more. `BOOKING_CONFIRMED` joins the session before it however late it arrives, and does not keep that session open.
5. **Salt.** Today's salt is created with `INSERT … ON CONFLICT DO NOTHING` and then read, so two first events at once agree. A request that hashed with yesterday's salt just before rotation is harmless.
6. **`GetBookingSetup`** (server only, `src/application/booking`, uncached and `no-store`): returns `{ bookable, notBookableReason?, channels: { whatsapp, email }, onlinePaymentPossible, services: [{ kind, unit, price, childPrice }], maxVehicles, checkInTime, timeZone, consentVersions }`. `bookable` uses the same rule as P7 (`onlineBookingEnabled`, check-in time, `verificationUsableForBranchNow` from `application/guests`). `onlinePaymentPossible` is gateway ready and branch enabled; whether the total is positive stays P6's decision (`paymentMethods`). `email` is true only when email codes are available and `onlinePaymentPossible`. Services come from the same repository P6 prices from.
7. **Selection and guests per unit.** The search's adults and children are the party for one unit. In the basket the guest picks units per listing (up to `unitsAvailable`, at most 5 in total, Q-69) and may adjust each unit's adults and children within the listing's `maxAdults` and `maxChildren`; P6 then checks availability for the mixed party. Results show the price for one unit. `u` uses `.` as separator (slugs match `SLUG_PATTERN`, which has no dot); the same listing may repeat.
8. **Deadline note.** The "already inside 24 hours" note is informational and recomputed on every details render; the cancellation and change endpoints decide later. A branch without a check-in time is not bookable, so the review never shows a missing deadline.
9. **Phone.** The phone stays required for every booking, including email verified ones (P7 matches `guest.phone` to the phone bound to the token).
10. **Payment return with an expired or rotated token** (`401` from G1): the neutral message that points to the confirmation message and My reservations.
11. **Browser details.** `crypto.randomUUID()` with a `crypto.getRandomValues` fallback. The details draft is cleared after a `201` and after `403 PHONE_BLOCKED`; the beacon never reads it.

**Data model sketch** (one additive migration, `site_analytics`, in T0a):

| Entity | Key fields | Notes |
| --- | --- | --- |
| `SiteEvent` | `id` BigInt PK; `occurredAt` timestamptz; `branchId` nullable FK to `Branch` (no cascade delete, `SET NULL`); `name` varchar 30 (CHECK in the fixed list); `funnelStep` int nullable (CHECK 1 to 8); `bookingStep` varchar 20, required only for `STEP_VIEW` and restricted to the fixed browser step list (approved at M10-T0a review); `path` varchar 200 nullable; `roomId` nullable; `sessionId` varchar 32 **nullable** (null only for the server search page's `SEARCH`); `visitorHash` char 32 **nullable** (null when the trusted client address is unavailable or the event is recorded without a browser request); `referrerHost` varchar 100; `utmSource`, `utmMedium`, `utmCampaign` varchar 60; `device` varchar 10 (CHECK `MOBILE`, `TABLET`, `DESKTOP`); `outcome` varchar 40 (an outcome code only, never dates); `stayCheckIn`, `stayCheckOut` date nullable (set only on `SEARCH`, for unmet demand) | Indexes `(occurredAt)`, `(branchId, occurredAt)`, `(sessionId, name)`. No personal data column exists. Implemented in M10-T0a and recorded in [data-model.md](../database/data-model.md) |
| `SiteDailyTotal` | PK `(date, branchId, dimension, key)`; `visitors`, `sessions`, `count` int | `branchId` is `*` for the whole site, `''` outside a branch, else the branch. Kept indefinitely (Q-87). Written by `RollUpSiteEvents` (M10-T0b) |
| `AnalyticsSalt` | `day` date PK; `salt` bytea (32 random bytes) | Only today's row survives rotation |
| `Reservation.analyticsSessionId` | varchar 32, nullable | Written in the P7 transaction for online bookings only (pay at hotel records step 8 at once and stores nothing); set to null in the transaction that resolves the payment (confirmed, failed, expired). CHECK: null unless `paymentMethod = 'ONLINE'` |

Relationships: `SiteEvent.branchId` N:1 `Branch` (optional); `SiteEvent.roomId` N:1 `Room` (optional, `SET NULL`). No relation to `Guest` or `Reservation`.

**State transitions**: none new. The journey reads the M8 and M9 reservation states (`AWAITING_PAYMENT → CONFIRMED | PAYMENT_FAILED`, cancellation and change request states) and never decides them.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
| --- | --- | --- | --- | --- | --- |
| P11 `/api/v1/analytics/events` (new) | POST | `sessionId` (32 hex), `events[]` ≤ 20: `name` (`PAGE_VIEW` or `STEP_VIEW`), `path`, `branchSlug?`, `roomSlug?`, `step?`, `referrer?`, `utm?`; JSON or `text/plain` | `204` for every valid shape (also when dropped) | Public; no cookie, no CSRF token (beacon), same origin check; bucket `analytics` 120 per minute per client | `422` invalid shape, `429` with `Retry-After` |
| P5, P6, P9, P10 (changed) | as today | optional header `Rivana-Analytics-Session` (32 hex; anything else ignored) | unchanged | unchanged | unchanged; the header never causes an error |
| P7 (changed) | POST | optional `analyticsSessionId` (any value is accepted and documented as a string; stored only when it is 32 lowercase hex, tracking is on, and the request is eligible, so never under `Sec-GPC: 1` or `DNT: 1`; never part of the idempotency fingerprint) | unchanged | unchanged | unchanged (the field never causes an error) |
| G1, G4 GET, G6 `200` (changed, implemented M10-T1) | GET, POST | unchanged | adds `branch.timeZone` (IANA name) to `GuestReservation`; G3 summaries unchanged | unchanged | unchanged |
| `BookingProvider` port (changed, approved) | — | `getLaunchDescriptor({ branchSlug, listingSlug? })` | `BookingLaunchDescriptor` (unchanged shape) | server only | — |
| P5, P6, P7, P9, P10, G1 to G6 | as built | as built | as built | as built | as built (consumed by the client) |

**Value sourcing**:

| Action | Value produced or displayed | Source |
| --- | --- | --- |
| Results | listings, `available`, `unitsAvailable`, `reason`, price per night, stay total before VAT | `SearchPublicAvailability` (same as P5) |
| Results | branch can book online (AC-10 explanation) | branch `onlineBookingEnabled` plus readiness, from the new `GetBookingSetup` query |
| Basket | subtotal | P6 `quote.accommodation` and `quote.subtotal` |
| Details frame | ready verification channels, online payment possible, active services with unit, prices, child prices, `maxVehicles`, check-in time, time zone | `GetBookingSetup(branchSlug)` application query (new, server only), reusing `VerificationChannelReadiness`, the services repository, and the branch row |
| Review | cancellation deadline and "already inside 24 hours" | `CancellationDeadline` (domain, CX-1) from branch check-in time and time zone and the selection's check-in, computed in the details frame |
| Review | subtotal, VAT rate, VAT, total, lines, services, discount | last P6 `quote` |
| Payment step | offered methods | P6 `paymentMethods`, narrowed to `ONLINE` after an email verification (AC-14) |
| Submit | `expectedTotal` | last P6 `quote.total` |
| Submit | `consent.privacyNoticeVersion`, `marketingOptIn.consentVersion` | `GUEST_CONSENT_VERSIONS` in `src/domain/guests/consent-policy.ts`, passed as props by the details frame |
| Submit | `Idempotency-Key` | `crypto.randomUUID()`, regenerated only when the request content changes |
| Submit | `analyticsSessionId` | client helper (`sessionStorage`), omitted under GPC or DNT |
| Confirmed and payment return | reference, status, manage token | P7 `201` saved to `sessionStorage`, then G1 |
| Verification | attempts left, resend time, expiry | P10 `context.attemptsLeft`, P9 `resendAvailableAt`, `expiresAt` |
| Manage | deadline shown in branch time | G1 `cancellationDeadline` with `branch.timeZone` |
| Manage | branch contact details | G1 `branch.phone`, `branch.email` |
| Manage | show cancel or change buttons | G1 `allowedActions` |
| Change | prefilled listings, occupancy, services with cars | empty G5 preview `current` |
| Change | prefilled flight details and contact fields | G1 `price.services[].details`, G1 `contact` |
| After `PRICE_CHANGED` (P7) | new quote and new `expectedTotal` | a fresh P6 call (P7's `context.quote` is only a loose `PriceChangedQuote`) |
| After `PRICE_CHANGED` (G6) | new preview and total | a fresh G5 call |
| Money display | formatted USD | one shared formatter for `Money` objects and `*Minor` integers, `Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })` |
| Analytics event | `funnelStep` | set by the server from `name`, `step`, and the normalized path (mapping table in `domain/analytics`), never by the client |
| Unmet demand | stay dates | `SiteEvent.stayCheckIn`, `stayCheckOut` from the search input |
| Online step 8 event | branch | the reservation's `branchId` |
| Change | version for `If-Match` | G5 `ETag` |
| Analytics event | `visitorHash` | HMAC SHA-256 (today's `AnalyticsSalt`, client IP from the trusted proxy header plus user agent), first 32 hex |
| Analytics event | `branchId`, `roomId` | resolved on the server from `branchSlug` and `roomSlug` (unknown slugs dropped to null) |
| Analytics event | `device`, `referrerHost`, UTM | derived from the user agent, the `referrer` field, and `utm` |
| Online step 8 | session id | `Reservation.analyticsSessionId` |
| Rollup | daily totals | `SiteEvent` rows of finished UTC days |

**Key invariants**:

- The browser never computes or sends a price other than the last server quote's total as `expectedTotal`.
- "Confirmed" is shown only when the latest server response says `CONFIRMED`.
- No token is ever placed in a URL query string, a log line, or an analytics row (AC-13).
- No analytics row holds an IP, query string, name, phone, email, reference, token, or code (CHECKs on name and device; no such columns).
- A funnel step is recorded after the use case returns and outside its transaction; a recording failure never changes the response.
- `Reservation.analyticsSessionId` is null for pay at hotel bookings and becomes null when an online payment resolves.
- Raw events older than 90 days are deleted by the rollup; only today's salt exists after rotation.
- Analytics never changes a booking: no analytics value can make P5, P6, P7, P9, or P10 fail, and the reservation and payment use cases import nothing from `analytics` (composition calls `RecordFunnelStep` after them and supplies their listeners; the session id column is written through the existing reservation repository).
- The analytics session id never appears in an audit row, a change history snapshot, a reservation snapshot, G1, or any staff response.
- Under `Sec-GPC: 1` or `DNT: 1` nothing is recorded or stored for that request, including the P7 field and the header.

**Security model**:

- All M10 pages are public. Branch scope comes from `requireBranch(params)` on the server, never from client input (AGENTS.md).
- Guest access is only through the manage token (G1, G2, G5, G6) or a guest session token (G3, G4), enforced by the existing use cases.
- Tokens: booking token and verification id in memory; manage token in the fragment and `sessionStorage`; guest session token in `sessionStorage` until expiry. None go into analytics, logs, or URLs.
- P11 accepts no personal data fields (strict schema), applies the `analytics` bucket (added to `PUBLIC_RATE_LIMITS` and cleaned by `npm run throttles -- cleanup-public`), and answers `204` without revealing whether an event was kept.
- No new third party script; CSP unchanged (same origin requests only; checkout is a top level navigation).
- Compliance: Egypt PDPL minimal analytics; the privacy notice text describing analytics is a launch item (Q-30, M15).

**Configuration required**: `ANALYTICS_ENABLED` defaults to false in production. Enable collection after publishing the analytics notice and starting the 90 day deletion job. The salt is generated in PostgreSQL storage with no environment secret. The client IP uses the existing trusted proxy setting.

**Critical test scenarios**:

- Happy path: pay at hotel with a room and an apartment, breakfast, transfer with 2 cars, a coupon, review with VAT, submit, "Confirmed", manage link works, database `CONFIRMED` (E2E-G-1), verifies AC-2, AC-3, AC-4, AC-5, AC-6.
- Failure: last unit taken by a second browser context, "no longer available", back to results, nothing created (E2E-G-2), verifies AC-7.
- Failure: price changed between quote and submit, new total shown, accept required (E2E-G-4), verifies AC-7.
- Failure: online payment refused or hold expired, return page says "Payment not completed", never "Confirmed" (E2E-G-3), verifies AC-6.
- Failure: wrong code, expiry, resend, blocked number (E2E-G-5), verifies AC-9, AC-14.
- Auth: an invalid manage link gets the neutral message; after the deadline no request or change button (E2E-G-6, E2E-G-9), verifies AC-8, AC-12.
- Privacy: walk the journey, then assert every funnel step shares one session id, no cookie was set, and no stored event contains the test name, phone, email, reference, token, or a query string; repeat with `Sec-GPC: 1` and assert nothing is stored (T-ANL-4 to 12), verifies AC-11, AC-13.
- Accessibility: axe, keyboard only, 320 px, touch targets on every step (E2E-G-8), verifies AC-9.

### Settled during M10-T0b (2026-11-26)

- **Daily totals.** One UTC day at a time, in three scopes: `*` (the whole site, each session once), each branch (the session's events in that branch), and `''` (pages outside a branch). A session counts on the day it started; the job loads the neighbouring days. `CODE_REQUESTED` and `PHONE_VERIFIED` take the branch the session was last on.
- **Dimensions** (`key`): `TOTAL` (`''`; `count` is page views), `FUNNEL_STEP` and `DROP_OFF` (step number), `VERIFY_ABANDONED` (`''`), `LANDING_PAGE` and `EXIT_PAGE` (path pattern; in a branch scope the first and last page in that branch), `REFERRER`, `UTM_SOURCE`, `UTM_MEDIUM`, `UTM_CAMPAIGN`, `DEVICE` (the session's value, applied to every scope it touched), `UNMET_DATE` (night) and `REFUSAL` (outcome), both counted on the day they happened with `count` as events, and `LISTING_VIEW`, `LISTING_QUOTE`, `LISTING_BOOKING` (listing id; `count` is events). `visitors` are that day's distinct hashes. A day with no events writes no row.
- **Job.** `RollUpSiteEvents` rotates the salt, totals the last 2 finished days that hold events and every older day without totals, replaces each day in one transaction, then deletes raw events older than 90 days only for days that have the `*` `TOTAL` row. A failed day keeps its events, and the command exits with status 1. Advisory lock key `724003` stops overlapping runs. It runs whether or not collection is on.

### Settled during M10-T1 (2026-11-26)

Owner decisions at planning and acceptance:

- **Client failures.** Besides `NETWORK`, the client reports `UNEXPECTED_RESPONSE` and `ABORTED`. It gives up after 30 seconds as `NETWORK` and never retries.
- **Results.** A success carries the HTTP status, so a P7 replay (`200`) and a G6 approval request (`202`) are told apart. A problem also carries `status`, `detail`, and `requestId`.
- **Visit id.** The client attaches it itself, and sets the P7 field over anything a caller passed.
- **P11.** T1 owns the sending (beacon with a `fetch` fallback, queries and fragments cut, events the server would refuse dropped). T10 decides when to send and imports `analytics-events` directly, to keep public pages small.
- **Time zone.** `branch.timeZone` is on every full guest reservation response: G1, G4 `GET`, and a G6 `200`.
- **Risk** stayed Medium.
- **Pricing fix, added at acceptance.** Staff creation, staff changes, guest changes, and paid change approval failed with `422` when a seasonal rate covered a night to price, because the stored rate record reached the strict resolver. Both callers now pass its five fields.

For later screens: show a fallback for an unknown problem code (T4 to T8b), and preview again if a G5 answer has no `ETag` (T8b).

### Settled during M10-T2 (2026-11-26)

- **Readiness.** The search page reads the branch fresh and applies the P7 rule: online booking on, a check-in time, and a usable verification channel (email counts only with online payment). M10-T4 moved this read into `GetBookingSetup` (`readiness()`), so there is one rule.
- **Limiter and analytics.** The page and P5 share the `availability` bucket (60 a minute per client), wired in `src/composition/public-rate-limit.ts`, which scheduled jobs must not import. The page passes no session, so only unmet demand is stored.
- **Failures.** A refused search shows the wait time. An unexpected failure keeps the entries and logs only the error class and a short code.
- **Browser tests.** `BOOKING_SEARCH_E2E=1` prepares bookable fixtures for `tests/e2e/booking-search.spec.ts`. It does not settle how the E2E-G journeys complete a booking (planned at T4).

### Settled during M10-T3 (2026-11-27)

- The basket starts empty. Added units use the search party within the listing’s guest limits. A change to the search criteria resets the basket.
- The basket waits 250 ms after edits settle before requesting P6 with an empty services list. Earlier requests are cancelled, and only the current answer can supply the accommodation subtotal. Quote failures preserve the selection.
- Each listing shows its selected count and a link to the basket. P6 quantity refusals are explained once per listing, and unit validation messages describe the affected guest fields.
- The owner approved preparing and testing the existing details URL in T3. Continue goes live in T4 when the destination validates and quotes the selection.

### Settled during M10-T4 (2026-11-27)

Owner decisions at planning (the four recommendations, approved with the plan):

- **Journeys with providers** run opt in on the development server (`BOOKING_JOURNEY_E2E=1`), where fake providers are allowed. The test asks for a code through the screen, then replaces its hash with a known one in the disposable database. No production code changed. This run is not part of the standard browser run, needs no other `next dev` in the checkout, and starts with an empty `.next/dev` (after a production build, a leftover cache made every page reload without end; clearing it fixed that).
- **Phone entry.** The server builds the country list, with Egypt first chosen. `libphonenumber-js/min` loads in the browser only when the phone is used, and checks the length only; the server decides validity.
- **Going back.** Continue writes `u` into the results address, and the basket is rebuilt from it ("Change selection", browser Back, and a refused selection). A new search still starts empty. This amends M10-T3.
- **Until M10-T5 and T6**, a verified guest sees that extras and payment are coming soon, with the hotel contacts. M10-T5 replaced this with the extras step; payment stays "coming soon" until T6.

As built:

- `GetBookingSetup` has `readiness()` (no services, for the search page) and `execute()` (adds active services and `maxVehicles`).
- The details page quotes through `QuoteBooking` under P6's `quote` bucket and records no website step. A broken selection returns to the results with `notice=selection`, an unavailable one with `notice=unavailable` and the selection.
- Email is offered only when the setup offers it and the quote lists `ONLINE`.
- Waits: a refused WhatsApp send and a WhatsApp code's resend time hold both channels (every send counts against the phone); the email equivalents hold email only, since the limit may be the address's own.
- Code and token expiry count on the device clock from when each request was made; the resend wait comes from the server's `resendAvailableAt` less the code issue time, so a wrong device clock does not change it.
- The tab draft holds name, email, country, phone and special requests. Line breaks in special requests become spaces, because the server refuses control characters there.
- A verification is dropped when the phone changes, and an email verification also when the email changes.

Known limits left open at acceptance: an email refusal that is really the phone's limit lets one WhatsApp send be refused; a code the server reports expired loses its resend wait; one dimmed "Send by email instead" button can lack a written reason. First load scripts are close to the 260 KB gate (results 259,207 bytes with headers), so later steps load on demand and the owner is asked if first load still exceeds it. The load after step 1 is about 300 KB.

### Settled during M10-T5 (2026-11-27)

Owner decisions at planning (the seven recommendations, approved with the plan):

- Risk stayed Medium.
- The price panel (`PriceSummary`) was built here, with VAT and total from the extras step. T6 reuses it and adds the per night breakdown.
- Flight number and arrival time are one optional field, matching the one stored text. It is not sent with price checks.
- The coupon rate limit is unchanged. A rate limited check with a code offers "Remove coupon".
- A typed code that was not applied stops Continue with "Apply the code or clear it."
- Staff service descriptions are not shown to guests; the wording is fixed in the interface.
- Visual baselines for all booking steps are one task, M10-T11, before milestone close.

As built:

- A price is current only when it answers exactly the chosen services, cars and code. Until then its figures are hidden and Continue waits. Away from the extras step no check runs, and the panel says the price updates on return.
- A refused new code keeps the earlier one. An accepted code that stops working, or a service switched off, is removed with a message and the rest is priced again.
- An email verified booking whose quote does not offer online payment cannot continue (Q-100).
- Choices live in memory only: they survive moving between steps and verifying again, and are lost on reload or a changed selection.
- The architecture test that guards reservation tables matches the text `.coupon`, so screen code reads the quote's coupon field by destructuring.

Open at acceptance: the booking pages are above the script budget ([performance.md](../frontend/performance.md#booking-page-scripts-m10)); narrowing that test pattern; and optional review points (the panel's wording away from the step after a sold out or closed answer, a repeated refusal not announced again, and a broad focus fallback).

## Build plan

The project builds backend before the screens that use it, one task at a time. Analytics backend first (it changes P7 and the payment paths, which the screens then exercise), then the client, then the journey in the order a guest walks it, then the after booking pages, then the launch pieces. Each UI task adds its component tests, E2E paths, axe checks, and visual baselines (390 and 1280 px) for its own steps.

1. M10-T0a: migration `site_analytics`, domain rules, `RecordSiteEvent`, salt rotation, P11 with the `analytics` bucket, bot, prefetch, and GPC/DNT filtering, satisfies **AC-11**, **AC-13**
2. M10-T0b: `RecordFunnelStep` and recorder; the session header on P5, P6, P9, P10; `analyticsSessionId` on P7 and the reservation column write and clear; step 8 from the callback and reconcile (expiry only clears the id); `npm run analytics -- rollup` with 90 day deletion, satisfies **AC-11**
3. M10-T1: typed API client, the analytics session helper, and `branch.timeZone` on the guest reservation response, satisfies **AC-5**, **AC-8**, **AC-13**
4. M10-T2: search and results page with the server `SEARCH` event and the booking off explanation, satisfies **AC-1**, **AC-9**, **AC-10**
5. M10-T3: selection basket with the P6 subtotal and the details page link, satisfies **AC-2**
6. M10-T4: details frame (`GetBookingSetup`), details step, verification step, draft storage, satisfies **AC-9**, **AC-13**, **AC-14**
7. M10-T5: extras with the car selector and flight details, coupon field, satisfies **AC-3**, **AC-4**
8. M10-T6: payment choice, review, placeholder legal copy flagged by the audit, submit, confirmed page, conflict and price change paths, satisfies **AC-5**, **AC-6**, **AC-7**, **AC-14**
9. M10-T7: payment return page, satisfies **AC-6**
10. M10-T8: manage page and My reservations with cancellation requests, satisfies **AC-8**, **AC-13**
11. M10-T8b: change booking flow, satisfies **AC-12**
12. M10-T9: Book Now internal mode with the approved `BookingProvider` port change, satisfies **AC-10**
13. M10-T10: beacon and `STEP_VIEW` events on every public page and booking step, within the script budget, satisfies **AC-11**

## Task breakdown (approved 2026-11-26)

Changes from the brief's provisional table: T0b and T4 raised to Critical; T0a now also carries `Reservation.analyticsSessionId`, the nullable `SiteEvent.sessionId` and `visitorHash`, and the stay date columns; T2 gains the server `SEARCH` event and the booking off explanation (AC-10); T4 gains `GetBookingSetup`; T6 gains the placeholder legal copy and the confirmed page; T1 gains the analytics session helper and the `branch.timeZone` contract change (so T8 stays UI only); T9 carries the approved port change. The brief's table was updated to match on approval.

| Task | Title | Risk | Depends on | Covers (criteria, tests) |
| --- | --- | --- | --- | --- |
| M10-T0a | Analytics foundation (ADR 029 accepted at planning, with the funnel wording amended): migration `site_analytics` (`SiteEvent` with nullable `sessionId` and `visitorHash` and stay date columns, `SiteDailyTotal`, `AnalyticsSalt`, `Reservation.analyticsSessionId`), pure event and funnel mapping rules, `RecordSiteEvent`, salt rotation, API P11 with strict parsing and the same origin rule, `analytics` limiter bucket, bot, prefetch, and GPC/DNT filtering | Critical | M9 | AC 11, 13; T-ANL-1…6 |
| M10-T0b | Server side funnel steps: `RecordFunnelStep` after the use case and outside its transaction; `Rivana-Analytics-Session` header on P5, P6, P9, P10; `analyticsSessionId` on P7 stored for online bookings and cleared when the payment resolves; step 8 from the callback and reconcile, expiry clearing the id; `npm run analytics -- rollup` (daily totals, 90 day deletion) on the hourly cron | Critical (writes inside the reservation and payment transactions) | T0a | AC 11; T-ANL-7…10 |
| M10-T1 | Typed API client on the contracts (`src/presentation/api-client/`), problem mapping, headers, analytics session helper, shared money formatter; additive `branch.timeZone` on `GuestReservation` (G1, G4) with OpenAPI | Medium | T0b | AC 5, 8, 13; client unit tests, G1 and G4 contract tests |
| M10-T2 | Search and results page, server `SEARCH` event, booking off explanation | Medium | T1 | AC 1, 9, 10 (page part); E2E-G-8 part |
| M10-T3 | Selection basket with server computed subtotal | Medium | T2 | AC 2 |
| M10-T4 | Details frame and `GetBookingSetup`, guest details, verification (WhatsApp, or email only with online payment, Q-100), draft storage | Critical (personal data, tokens) | T3 | AC 9, 13, 14; E2E-G-5; `PhoneVerificationStep` tests; a test that no token reaches a URL, log line, or analytics row |
| M10-T5 | Extras (transfer car selector and flight details, Q-82) and coupon | Medium | T4 | AC 3, 4; `ServicesPicker`, `CouponField` tests |
| M10-T6 | Payment choice, review, placeholder legal copy, submit, confirmed page, conflict and price change paths | Critical | T4, T5 | AC 5, 6, 7, 14; E2E-G-1, 2, 4, 7; `PriceSummary` tests; an E2E where an email verified guest sees only online payment |
| M10-T7 | Payment return page | Critical | T6 | AC 6; E2E-G-3 |
| M10-T8 | Manage reservation and My reservations with cancellation requests | Critical | T1 | AC 8, 13; E2E-G-5 part, E2E-G-6 |
| M10-T8b | Change booking: prefill from an empty G5 preview, preview and apply (G5, G6), old and new totals, "sent to the hotel for approval", deadline and contact fallback | Critical | T8, T5 | AC 12; E2E-G-9 |
| M10-T9 | Book Now internal mode per branch (`BookingProvider` port takes the branch and listing, approved) | Low | T6 | AC 10; E2E-G-8 part |
| M10-T10 | Page view beacon on every public page, `STEP_VIEW` in each booking step, session id kept across steps and sent with P7, within the script budget | Medium | T0a, T6, T8 | AC 11; T-ANL-11…12, Lighthouse budget |
| M10-T11 | Visual baselines for every booking step at 390 and 1280 px (added 2026-11-27, owner approved at M10-T5 planning; runs on the development server with fake providers). Runs after T10, before milestone close | Low | T2 to T10 | Brief tests: visual baselines |

## Consequences

**Positive**:

- Guests can book, pay, cancel, and change online with every rule enforced by the API that M8 and M9 already proved.
- Search works without JavaScript and stays cheap on scripts.
- The hotel gets exact funnel numbers, including unmet demand and refusals, with no cookie banner.

**Negative / tradeoffs**:

- Two rendering models in one journey (server search, client steps) mean two kinds of tests.
- The search step is counted from two sources (server event for demand, beacon for the session); a guest without JavaScript is counted for demand but not in the session funnel.
- A session is linked to a reservation row for up to the hold's lifetime (about 15 minutes, longer only while reconcile resolves a lost callback).
- Typed only responses mean contract drift is caught by tests, not at runtime.
- Typed contact details sit in `sessionStorage` until submit or tab close.
- Four contract changes need OpenAPI updates: the optional header on P5, P6, P9, P10; the P7 field; `branch.timeZone`; and the new P11. One port changes (`BookingProvider`).
- Repeated quote and code steps are skipped for 30 minutes, so raw counts of re-quotes are not kept.
- Report days are UTC, so a visit just after midnight in Egypt counts on the previous day.
- A step whose server stops between the booking commit and the recording is lost; there is no retry.
- A visitor without JavaScript counts for unmet demand but not in the session funnel, and a new tab starts a new session.

**Neutral**:

- One new hourly cron command (`npm run analytics -- rollup`).
- `DisabledBookingProvider` is replaced; the booking launch descriptor gains branch awareness.
- Legal copy is placeholder until M15; online booking stays off until then.

## Follow-up

- [x] Owner accepted ADR 029 and the T0a privacy decisions at planning.
- [ ] Update [api-contracts.md](../api/api-contracts.md), [route-map.md](../frontend/route-map.md), [booking-and-operations-ui.md](../frontend/booking-and-operations-ui.md), [data-model.md](../database/data-model.md), and [test-matrix.md](../testing/test-matrix.md) in the task that changes each.
- [ ] `ui-ux-pro-max` was copied without a licence file; confirm its licence upstream before the repository is shared outside the team.
- [ ] Q-22, Q-30, Q-64 text replaces the placeholders before online booking is switched on (M15).
- [x] Confirmed the prefetch headers during T0a. The bundled Next.js docs name `Next-Router-Prefetch` and `Purpose: prefetch`. `Sec-Purpose` is the browser's own header and is not in those docs. The collector drops all three, and also `Next-Router-Segment-Prefetch` ([site-event.ts](../../src/domain/analytics/site-event.ts)).
- [x] Record the accepted search source, nullable visitor hash, approved traffic labels, and production activation rules in ADR 029 and FR-ANL.

## Cross check (2026-11-26)

An independent read only pass on a different model (Claude Sonnet) checked decision completeness and soundness against the brief, ADRs, contracts, and code. It found 16 gaps; the owner chose to apply every recommended resolution, now recorded in *Settled by the cross check*, the API surface, value sourcing, invariants, and the task table. Its suggestion to drop `Reservation.analyticsSessionId` in favour of counting the confirmation from the return page was not taken: that would miss guests who close the tab after paying, which is the case FR-ANL-6 needs; the column is isolated behind the existing repository and the port instead.
