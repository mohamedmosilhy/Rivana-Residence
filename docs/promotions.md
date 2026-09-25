# Promotion codes

## Scope

Rivana owns the marketing presentation of promotion codes. Staff can create, schedule, preview, publish, unpublish, prioritize, and archive campaigns. The public site may show one active campaign in an accessible popup and let the visitor copy the code.

Rivana does not validate codes, calculate discounts, inspect reservations, track redemptions, or decide eligibility. Those responsibilities remain with the future reservation provider.

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

## Reservation handoff

Before the external provider is configured, the visitor can keep the copied code for later use. When the booking provider contract becomes available, pass the code only if the provider officially supports a promotion-code parameter and the security/privacy review approves it. Otherwise the visitor pastes it into the provider's own form.

The website must never claim that copying the code guarantees acceptance or a particular price. The popup should say that terms apply and the reservation system confirms eligibility.

## Analytics

If analytics is approved, record only non-sensitive events such as popup shown, dismissed, and copy attempted/succeeded, keyed by campaign ID. Do not store clipboard contents, guest identity, reservation details, or redemption claims.
