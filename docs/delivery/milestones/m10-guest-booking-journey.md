# M10 — Guest booking journey

Status: **Not started.** Scope extended by the owner on 2026-11-17 with first-party website analytics (M10-T0a, T0b, T10; ADR 029, Q-86, Q-87), the guest change UI (M10-T8b; Q-83…Q-85), and the transfer car selector (M10-T5; Q-82). Branch: `m10-guest-booking-journey`. Follow the [milestone loop](./README.md#the-loop-every-milestone-follows).

## Objective

Guests book end to end on their branch's site: choose dates and guests, see only available rooms and apartments with prices before VAT, choose one or more units, verify their phone, add optional services and a coupon, choose Paymob or pay at the hotel, review the VAT line and total, and submit. They see a confirmation only for a `CONFIRMED` booking, and can view their bookings and request cancellations later.

## Read first

- [frontend/booking-and-operations-ui.md](../../frontend/booking-and-operations-ui.md) (customer journey), [frontend/route-map.md](../../frontend/route-map.md), [frontend/design-system.md](../../frontend/design-system.md), [frontend/component-architecture.md](../../frontend/component-architecture.md)
- [requirements/user-stories-and-acceptance-criteria.md](../../requirements/user-stories-and-acceptance-criteria.md) (US-G1…G7)
- [api/api-contracts.md](../../api/api-contracts.md) (P5, P6, P7, P9, P10, P11, G1–G6)
- [ADR 029](../../adr/029-first-party-site-analytics.md) and FR-ANL (analytics); FR-GCHG and GC-1…6 (guest changes); SV-5 (cars)
- ADRs [009](../../adr/009-server-components.md), [012](../../adr/012-motion-library.md), [024](../../adr/024-immediate-confirmation.md), [025](../../adr/025-paymob-online-payment.md), [027](../../adr/027-booking-price-composition.md)
- Next.js guides: Server and Client Components, forms, `searchParams`, `redirect`

## Blocking questions

- Q-05 (decided: the review shows "VAT (n%)" with the Admin's rate), Q-22 (child policy text), Q-30 (privacy, cancellation and refund terms, consent wording), Q-64: approved text is needed **before online booking is switched on** (M15), not to build. Use clearly marked placeholder copy that the content audit (`npm run audit:content`) flags as a launch blocker.

## Skills for this milestone

| Step | Skill | Notes |
| --- | --- | --- |
| Spec | `/architect` (`FEATURE`) | Step structure, state in URL vs component, typed API client, return-from-Paymob page |
| Build | `/develop` (UI track; logic track for the API client and `BookingProvider` mode) | Reuse design tokens, `site/classes.ts`, existing form patterns |
| Tests | `/test` | E2E with the fake WhatsApp adapter and fake payment gateway |
| Failures | `/debug` | |
| Proof | `/check verify` | Drive every path in a browser, including keyboard-only |
| Review | `/check review` | Focus: no client-side price authority, honest states, accessibility |
| After merge | `/sync` | |

## In scope

Booking pages under `/{branch}/book`, manage page, "My reservations", cancellation request UI, marketing opt-in checkbox, Book Now internal mode, typed API client, placeholder legal copy flagged by the audit, visual baselines. Added 2026-11-17: the `analytics` module backend (collection endpoint, server-side funnel steps, rollup and retention job), the page-view beacon on every public page, step events in each booking step, the "Change booking" flow, and the car selector for the transfer.

## Out of scope (binding)

- Staff screens (M11, M12), including the website report (M12-T4b). Broadcast UI (M13). Currency conversion (Q-46). Embedded card forms or Paymob frames.

## Task breakdown

Planned, reviewed, and accepted one task at a time ([agent-workflow.md](../../engineering/agent-workflow.md)). Rows are confirmed at milestone open; the numbered **Tasks** below hold the detail. This table is provisional: re-confirm it against the code and decisions at milestone open.

| Task | Title | Risk | Depends on | Covers (criteria, tests) | Status |
| --- | --- | --- | --- | --- | --- |
| M10-T0a | Analytics foundation (ADR 029): migration `site_analytics` (`SiteEvent`, `SiteDailyTotal`, `AnalyticsSalt`), pure event and funnel rules, `RecordSiteEvent`, API P11 with strict parsing, `analytics` limiter bucket, bot and GPC/DNT filtering, daily salt rotation | Critical | M9 | AC 11; T-ANL-1…6 | Not started |
| M10-T0b | Server-side funnel steps from P5, P6, P9, P10, P7, and the Paymob result (after the use case, outside its transaction); `analyticsSessionId` on P7; `npm run analytics -- rollup` (daily totals, 90-day deletion) | Medium | T0a | AC 11; T-ANL-7…10 | Not started |
| M10-T1 | Typed API client on the contracts (`src/presentation/api-client/`) | Medium | M9 | client unit tests | Not started |
| M10-T2 | Search and results page | Medium | T1 | AC 1, 9 | Not started |
| M10-T3 | Selection basket with server-computed subtotal | Medium | T2 | AC 2 | Not started |
| M10-T4 | Guest details and phone verification step | Medium | T3 | AC 9 | Not started |
| M10-T5 | Extras (with the transfer car selector and flight details, Q-82) and coupon | Medium | T3 | AC 3, 4 | Not started |
| M10-T6 | Payment choice, review, submit, confirmation, conflict and price-change paths | Critical | T4, T5 | AC 5–7 | Not started |
| M10-T7 | Payment return page | Critical | T6 | AC 6 | Not started |
| M10-T8 | Manage reservation and My reservations with cancellation requests | Critical | T1 | AC 8 | Not started |
| M10-T8b | Change booking: preview and apply on the manage page and in My reservations (G5, G6), old and new totals, "sent to the hotel for approval" state for paid bookings, deadline and contact fallback (Q-83…Q-85) | Critical | T8, M9-T10, M9-T11 | AC 12 | Not started |
| M10-T9 | Book Now internal mode per branch | Low | T6 | AC 10 | Not started |
| M10-T10 | Page-view beacon on every public page (marketing and booking), `STEP_VIEW` events in each booking step, session id kept across steps and sent with P7; within the script budget | Medium | T0a, T6 | AC 11; T-ANL-11…12, Lighthouse budget | Not started |

## Tasks

1. **Search** `/{branch}/book?checkIn&checkOut&adults&children`: a plain GET form (works without JavaScript), native date inputs, errors next to fields and announced; results from API-P5 rendered on the server: each available listing with its Room or Apartment badge, price per night and stay total **before VAT**, and a units selector up to the available count (cap per booking from the spec); unavailable listings with a reason.
2. **Selection basket**: one or more units across listings (same dates); a running accommodation subtotal from API-P6 (server computed).
3. **Details**: guest name, email, phone (country selector, E.164), special requests; phone verification step (`PhoneVerificationStep`, API-P9 and P10) with resend timing, attempts left, and the neutral blocked-number message.
4. **Extras**: breakfast and airport transfer offered with their prices by unit (per booking, per night, per person, per person per night, or per car, child price where set) when the branch has them active; nothing preselected. The transfer has a car selector (1 to the branch's maximum, default 1) and optional flight number and arrival time; changing the cars re-quotes (Q-82).
5. **Coupon**: one code field; applying re-quotes through API-P6; a refusal shows the reason in plain words.
6. **Payment choice**: "Pay online now (Paymob)" and "Pay at the hotel", each with a one-line explanation; online hidden when Paymob is not configured for the branch.
7. **Review**: every unit, nights, per-night breakdown, services, discount, **subtotal, VAT (rate shown), total**, payment choice, cancellation terms (request online until 24 hours before check-in time; within 24 hours contact the hotel; Q-64 note when already inside the window), unselected services as an optional cross-sell ("Add breakfast for $X?") that changes nothing until the guest accepts, the marketing opt-in checkbox (unticked) with its wording, privacy consent.
8. **Submit** (API-P7 with an `Idempotency-Key` kept across retries): pay at hotel → confirmation page (reference, "Confirmed", details, manage link note); Paymob → navigate to `checkoutUrl`. Conflict and price-change paths as designed.
9. **Payment return** `/{branch}/book/payment`: reads the manage token kept in `sessionStorage`, polls API-G1 briefly, shows "Confirmed" only when the status is `CONFIRMED`, "Payment not completed" for `PAYMENT_FAILED`, and a waiting state otherwise; never trusts the return query string.
10. **Manage** `/reservations/manage#t=…` and **My reservations** `/reservations/find`: status, details, payment status, and "Request cancellation" (with reason) when before the deadline; otherwise the branch's contact details. Shows open, approved, rejected, and refund states.
11. **Book Now**: `BookingProvider` internal mode per branch: when the branch has online booking on and the listing is bookable, Book Now goes to `/{branch}/book` prefilled with the listing; otherwise the honest disabled control.
12. Typed API client in `src/presentation/api-client/` built on the contracts.
13. **Analytics backend (M10-T0a, T0b; ADR 029).** The `analytics` module and API P11 as the ADR describes; the funnel steps recorded by the server from the API use cases through a port called after their own work, so a tracking failure never changes a booking; the rollup and retention job on the hourly cron.
14. **Change booking (M10-T8b).** On the manage page and in My reservations, "Change booking" opens the same steps as booking (dates, units, guests, extras with cars, contact details) prefilled with the reservation; the preview (G5) shows what changed and the old and new totals with VAT; confirm calls G6 with `If-Match` and the previewed total. Pay at hotel → "Your booking was changed"; paid with a new total → "Sent to the hotel for approval". Phone, branch, payment method, and coupon are shown read-only. After the deadline or with an open request, the branch's contact details replace the button.
15. **Beacon and step events (M10-T10).** A client component of about 1 KB in the public layouts sends `PAGE_VIEW` on navigation and `STEP_VIEW` on each booking step through `sendBeacon`; it does nothing under GPC or DNT and never blocks rendering.

## Database and API impact

One additive migration, `site_analytics` (M10-T0a), and one public endpoint, API P11. P7 gains the optional `analyticsSessionId`. Otherwise consumes M5–M9 APIs.

## Acceptance criteria

1. Results list only listings of the chosen branch that are available for the dates and party, with prices before VAT; a fully booked listing shows "not available for these dates".
2. A guest can book two units (for example one room and one apartment) in one booking.
3. Services and the cross-sell are never added without an explicit guest action; removing them updates the total.
4. A valid coupon changes the quote and total; an invalid one shows its reason and leaves the total unchanged.
5. The review shows the VAT line and a total that equals the server quote; no total is computed in the browser.
6. Pay at hotel: the confirmation page appears only after a `201` with `CONFIRMED`. Paymob: the guest is sent to the hosted checkout; the return page says "Confirmed" only for `CONFIRMED` and never on a failed or pending payment.
7. Conflict (`INVENTORY_UNAVAILABLE`) returns the guest to results with an explanation; `PRICE_CHANGED` shows the new total and requires explicit acceptance.
8. Cancellation request works before the deadline and is replaced by contact details after it.
9. Every booking step passes axe with no serious or critical issues, works by keyboard, has no overflow at 320 px, and meets the 44 px touch target rule.
10. With online booking off for a branch, Book Now stays disabled and `/{branch}/book` explains how to book by contacting the hotel.
11. Visiting pages and walking the booking journey produces events for every funnel step with the same session id and no cookie; a confirmed booking is linked to its session; no stored event contains an IP, query string, name, phone, email, reference, or token; GPC stops recording; the rollup produces daily totals and deletes events older than 90 days; the public pages stay within the Lighthouse budgets.
12. A guest changes a pay-at-hotel booking (dates, units, extras with cars) and sees the new details at once; a paid booking with a new total shows "sent to the hotel for approval"; after the deadline the button is replaced by contact details; no total is computed in the browser.

## Tests

E2E-G-1…8 ([test-matrix.md](../../testing/test-matrix.md)), E2E-G-9 (change booking, added 2026-11-17); T-ANL-1…12 (analytics, added 2026-11-17); component tests for `PhoneVerificationStep`, `PriceSummary`, `CouponField`, `ServicesPicker`; visual baselines for every step at 390 and 1280 px.

## Evidence for the report

Screenshots of every step (desktop and mobile), including errors, conflict, coupon refusal, payment failed, confirmation, manage page with an open request; axe output.

## Risks

- Legal and tax wording not ready: online booking stays off until approved text replaces the placeholders.
- Paymob return-page timing: polling with a clear waiting state.

## Handoff

Close the milestone ([README steps 8–15](./README.md#the-loop-every-milestone-follows)), report, then stop. M11 has not started.
