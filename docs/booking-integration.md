# Booking integration boundary

## Ownership

```text
Rivana marketing site
  -> presents room and property content
  -> invokes BookingProvider
External hotel/reservation module
  -> owns rates, inventory, availability, guests, reservations, payments, policies, and management
```

The marketing database must never become a shadow booking system.

## Initial behavior

The initial adapter is `DisabledBookingProvider`:

- `isEnabled` is false;
- Book Now buttons retain their final placement, size, variants, and analytics intent;
- controls use a real `<button type="button" disabled>` or an accessible unavailable dialog pattern, never an anchor with `href="#"`;
- helper text/accessible description says online booking will be available soon and directs urgent users to phone/contact if approved by the client;
- no date picker, guest selector, rate, “from” price, fake search, availability calendar, or success state is rendered.

This intentionally differs from the design-study HTML, whose fake calendar and prices are excluded from production.

## Application port

Conceptual contract:

```ts
type BookingContext = {
  source: "header" | "room-card" | "room-detail" | "mobile-bar";
  roomSlug?: string;
};

type BookingLaunch =
  | { kind: "disabled"; message: string }
  | { kind: "external-url"; url: string }
  | { kind: "embed"; provider: string; publicConfig: Record<string, string> };

interface BookingProvider {
  getLaunch(context: BookingContext): Promise<BookingLaunch>;
}
```

This is a design contract, not Phase 0 application code. Provider-specific room identifiers, scripts, URL parameters, or events must remain inside the eventual infrastructure adapter/mapping.

## UI contract

All booking entry points use a shared `BookNowButton`/`BookingLauncher` feature component. Marketing pages supply only context such as room slug and visual variant. They do not construct provider URLs or embed markup.

Expected transition:

1. Disabled state ships.
2. Provider supplies documented integration and security requirements.
3. Add provider configuration and, only if needed, a room-to-provider identifier mapping.
4. Implement one adapter and launcher mode.
5. Enable behind environment/configuration and test in preview.

No page rewrite should be necessary.

## Supported future patterns

- **External link:** provider-hosted booking page, optionally with an approved room code.
- **Modal/embed:** provider script or iframe loaded only after user intent where possible.
- **Hosted widget section:** provider module mounted in a dedicated route/section.

The final choice waits for provider documentation. An iframe requires allowlisted `frame-src`, title, focus behavior, responsive height, privacy/cookie review, and a fallback link. A script widget requires a narrow CSP allowlist, integrity/version strategy when available, performance budget, consent review, cleanup on navigation, and documented data flow.

## Data rules

- Do not store prices or availability returned by the provider unless a later requirement and retention policy explicitly justify caching.
- Do not persist reservation/guest/payment data in Rivana's database.
- Do not send contact form data into the booking provider.
- Keep provider secrets server-only; expose only public widget configuration.
- If provider room codes are needed, add a small mapping field/table in the integration migration after the provider contract is known.

## Failure and analytics

- If the provider is unavailable, show a calm failure message plus phone/contact fallback; never imply a reservation succeeded.
- Track `booking_cta_view`, `booking_cta_click`, `booking_launch_success`, and `booking_launch_failure` without sending guest-entered or sensitive data.
- External navigation should clearly remain a booking action and may open in the same tab unless provider UX requires otherwise.

## Provider acceptance checklist

- contract and data-processing/privacy review;
- staging/sandbox credentials;
- room-code mapping and deep-link format;
- CSP domains and cookie behavior;
- accessibility and mobile behavior;
- loading/error/timeout behavior;
- analytics callback/events;
- cache and version policy;
- confirmation that the provider is the sole source of rates and availability;
- E2E coverage at the marketing/provider handoff.
