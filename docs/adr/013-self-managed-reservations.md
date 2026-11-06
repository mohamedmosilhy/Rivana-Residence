# ADR 013 — Self-managed reservations with an explicit external-system boundary

Status: **Accepted (business direction, 2026-10-24)**. Supersedes [ADR 008](./008-booking-boundary.md). The detailed design decisions in ADRs 014–022 were accepted on 2026-10-24. **Amended by [ADR 024](./024-immediate-confirmation.md) (2026-11-06):** website bookings are confirmed immediately, so the request-to-book mitigation named under Risks no longer applies; the manual synchronization and the `HotelSystemSync` port are unchanged.

## Context

ADR 008 kept Rivana a marketing site: Book Now stayed inert until an external hotel-management provider supplied a booking module (Plan A) or an availability/reservation API (Plan B, the August 2026 scope PDF). The provider supplied neither. The client has decided that Rivana will manage branches, room types, physical rooms, prices, availability, blocks, and reservations itself. Receptionists will copy reservations between Rivana and the hotel's existing operational system (PMS) by hand.

## Problem

How do we bring reservations into a system that was designed to keep them out, without (a) breaking the accepted CMS, (b) pretending to integrate with a PMS that has no API, or (c) building something that has to be rewritten if an integration appears later?

## Options considered

1. **Keep waiting for the provider.** No online booking at all. Rejected by the client.
2. **Fake integration** (stub adapter that returns "available"). Misleading and unsafe; forbidden.
3. **Separate reservation application** (another service or framework). Duplicates auth, deployment, and design system; violates the Next.js-only rule.
4. **Self-managed reservation modules inside the existing modular monolith**, with an explicit port for a future PMS integration that ships as "manual" (no adapter).

## Decision

Option 4. Rivana's PostgreSQL database becomes the system of record for reservations it takes or that staff record. The PMS remains a separate system; there is **no automated synchronization**. A `HotelSystemSync` application port is defined but has no adapter. Manual synchronization is a documented staff procedure ([manual-synchronization-procedure.md](../operations/manual-synchronization-procedure.md)).

The existing `BookingProvider` port stays. It gains an internal launch mode, so a branch with online booking enabled sends Book Now to Rivana's own booking journey, and a branch without it keeps today's honest disabled state.

## Rationale

- It reuses the accepted architecture, auth, admin shell, design system, and test harness.
- An explicit integration port keeps the reservation domain independent of any future PMS contract.
- The disabled path keeps working for branches not yet taking online bookings.

## Consequences

- The Phase 0 "no booking data" rule is lifted. The documentation now describes reservations throughout, but the `booking scope` test in `tests/unit/architecture/persistence-boundaries.test.ts` must be replaced in M4 with boundary tests that keep reservation data in the reservation modules.
- Rivana can prevent conflicting reservations **inside its own database**. It **cannot** guarantee that a reservation accepted only by the PMS will not conflict with one of Rivana's until staff record it. This limitation is permanent while synchronization is manual ([known-limitations.md](../operations/known-limitations.md)).
- Online booking now handles guest personal data, which raises the privacy and security bar ([security/threat-model.md](../security/threat-model.md)).

## Risks

- Staff do not follow the synchronization procedure, so the two systems drift. Mitigations: request-to-book confirmation (ADR 016 / lifecycle), sync checkpoints, audit history, manager compliance review.
- A future PMS API may model inventory differently. Mitigation: the integration port speaks Rivana's domain language; mapping lives in the adapter.
