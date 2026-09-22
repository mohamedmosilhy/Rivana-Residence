# ADR 008 — External booking provider boundary

Status: Accepted for Phase 1

## Context

The hotel-management vendor will own booking but has not supplied an API/embed contract. The reference contains prices and a fake availability calendar that could mislead visitors and contaminate the data model.

## Decision

Define a `BookingProvider` application port and ship `DisabledBookingProvider`. All booking entry points use one feature component and remain inert with an accessible explanation. Add no booking/rate/availability tables or APIs.

## Reasoning

This preserves final CTA placement without inventing hotel operations. The eventual provider becomes an adapter, preventing pages from coupling to URLs, scripts, room codes, or iframe behavior.

## Alternatives considered

- **Temporary fake search/calendar:** misleading, creates throwaway code and ownership ambiguity.
- **Hardcoded placeholder URL:** broken UX and page-level coupling.
- **Wait to render buttons:** loses layout/UX planning and a clear integration seam.
- **Build reservations internally:** explicitly outside business scope.

## Consequences

Initial conversion is phone/contact rather than online booking. Phase 13 depends on provider documentation. Provider-specific CSP, privacy, performance, accessibility, and mappings are deferred intentionally.
