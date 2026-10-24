# Promotion codes

## Scope

Rivana owns the marketing presentation of promotion codes. Staff can create, schedule, preview, publish, unpublish, prioritize, and archive campaigns. The public site may show one active campaign in an accessible popup and let the visitor copy the code.

Rivana does not validate codes, calculate discounts, track redemptions, or decide eligibility. A promotion is marketing only. When an offer should change the price, staff create an `OFFER` rate period for the room types and dates instead (see [availability-and-pricing-rules.md](./availability-and-pricing-rules.md#pricing-scope-pdf-sections-23)); it applies automatically to bookings for those nights.

## Admin behavior

The protected `/admin/promotions` area provides list, create, and edit workflows. A publishable promotion requires:

- an internal name;
- a public headline and concise plain-text body;
- a non-empty code using the approved printable allowlist;
- an optional plain-text terms summary;
- a valid optional start/end window in the property's configured timezone;
- popup enabled/disabled and a priority value.

The form previews the real public component. When another campaign has higher priority, the UI names the campaign that will display. Draft, unpublished, archived, and expired records remain available to staff but are never returned by the public query.

## Public selection

The server selects at most one campaign where:

- status is `PUBLISHED`;
- popup display is enabled;
- `startsAt` is absent or not in the future;
- `endsAt` is absent or still in the future.

Sort by priority descending, then publication time descending, then stable ID. Cache the result under `promotion:active`; every promotion mutation invalidates that tag. Server time is authoritative.

## Popup experience

- Render no popup/client JavaScript when no campaign is active.
- Present the active campaign after the primary page content becomes usable; do not block the initial render or LCP.
- Use a labelled modal dialog with a close button, Escape, focus containment/return, and reduced-motion behavior.
- Keep the code visible and selectable. The copy button announces success or failure; manual selection remains the fallback.
- Store only `{promotionId, version, dismissedUntil}` in browser storage. The default dismissal period is seven days for that version.
- Do not use sound, countdown pressure, auto-rotation, or personal profiling.

## Relationship to booking

The booking journey has no promotion-code field (codes are not redeemed, BR-12). A visitor can quote the code to the hotel, which applies any benefit by its own policy. Offer prices that the website should show automatically are `OFFER` rate periods, not codes.

The website must never claim that copying the code guarantees acceptance or a particular price. The popup says that terms apply.

## Analytics

If analytics is approved, record only non-sensitive events such as popup shown, dismissed, and copy attempted/succeeded, keyed by campaign ID. Do not store clipboard contents, guest identity, reservation details, or redemption claims.
