# Scope traceability matrix

## 1. Scope PDF → new plan

The PDF (`docs/source/Rivana_Residence_Project_Scope.pdf`, 7 pages, v1.0, 15 Aug 2026) was extracted and read in full on 2026-10-24. Classification: **R** retained unchanged, **M** retained with modifications, **X** replaced by the manual reservation workflow, **D** deferred or not in this release, **✓** already delivered by Phases 0–11.

| PDF § | Item | Class | Where it lands |
| --- | --- | --- | --- |
| 1 | Rebuild site with the same design (Home, About, Rooms, Room details, Amenities, Contact) | ✓ | Phases 1–10 |
| 1 | Terms & Conditions, Cancellation/Refund pages | D | Content pages once the client supplies text (Q-07) |
| 1 | Booking/reservation flow | M | Self-managed journey, M8 |
| 1 | Content and images editable from the dashboard | ✓ | CMS |
| 2 | Add/edit rooms, images, capacity, amenities, enable/disable | ✓ / M | Existing CMS; rooms gain a branch (FR-CAT-1) |
| 2 | Set room prices; period prices; seasonal/date pricing applied automatically | M | FR-PR-1…3, PR-2…5, M6 |
| 3 | Offers with validity applied automatically | M | `OFFER` rate periods (Q-06), M6 |
| 3 | Loyalty offers for registered customers | D | Needs accounts (BR-12) |
| 4 | Select dates and guests, view available rooms, see price, enter details, submit, confirmation | M | FR-AV, FR-RES-1/2, M7–M8 |
| 4 | Availability through the hotel's API | **X** | Rivana's own inventory (ADR 013, 016) |
| 4 | Send reservation to the hotel's system | **X** | Staff enter it in the PMS on confirmation (manual procedure) |
| 4 | Reservation appears in our dashboard | R | FR-OPS-2/3 |
| 4 | Handle availability changing between check and request | R | ADR 016 lock; `PRICE_CHANGED`/`INVENTORY_UNAVAILABLE` |
| 4 | Online payment (Stripe/Paymob) | D | Q-08 |
| 4 | Pay on arrival; stored with the reservation | M | `PAY_AT_HOTEL`; "hotel system integration" part **X** |
| 5 | Email verification/confirmation | M | Request-received and confirmation emails (FR-NTF-1) |
| 5 | WhatsApp | M | Phone verification codes and guest booking messages by WhatsApp (FR-GST-1, FR-NTF-1; Q-28, Q-32) |
| 5 | Verification before confirmation, to be finalized | M | Staff confirmation (request to book, Q-02) |
| 6 | Customer accounts, history, loyalty, targeted offers | M | Verified phone profiles with history; "My reservations" by phone and code; no passwords; loyalty deferred (ADR 019, Q-27) |
| 7 | One dashboard, role permissions | R | Existing `/admin` shell, extended (ADR 018) |
| 7 | Receptionist: view, accept/decline, customer info, availability, workflow; no prices, settings, or content | R | Capability matrix |
| 7 | Manager: + prices, statistics, occupancy, performance | R | Capability matrix; FR-RPT |
| 7 | Admin: everything, plus users, roles, branches, settings | R | Capability matrix; FR-BR, FR-IAM |
| 7 | Admin: manage the external reservation system integration | **X** | No integration; `HotelSystemSync` port reserved |
| 7 | Admin: manage customers | M | Guest profiles: search, history, block or unblock a phone number (FR-GST-3/4; Admin and Manager, Q-29) |
| 8 | Multiple branches with info, images, rooms, prices, offers, contact | M | ADR 017; branch-specific website content D (Q-04) |
| 8 | Branch subdomains example | D | Path-based first (Q-03) |
| 9 | Own accounts, role-based permissions | ✓ / M | Better Auth plus new roles |
| 9 | Records of important management actions | M | `AuditEvent` for reservations, prices, inventory, access; CMS content later (Q-15) |
| 10 | Statistics: counts, confirmed, cancelled/declined, occupancy, room performance, revenue, trends | R | FR-RPT, M10 |
| 11 | Open points (PMS API, prices source, WhatsApp, providers, payment, cancellation rules, permissions, statistics, subdomains, loyalty, self-service cancel) | M | [assumptions-and-open-questions.md](./assumptions-and-open-questions.md) |

**New requirements not in the PDF:** manual-sync procedures with 30-minute sound and pop-up reminders (BR-11, FR-OPS-6), phone blocking (BR-19), external-reservation recording (FR-RES-4), maintenance blocks (FR-INV-2), physical-room inventory and assignment (FR-INV-1, FR-RES-8), check-in, check-out, and no-show, idempotency, a secure guest link, and sync checkpoints.

## 2. Requirement → rules → API → milestone → tests

| Requirement | Rules | API | Milestone | Tests |
| --- | --- | --- | --- | --- |
| FR-BR-1…4 | branch-model | A1–A3, P1, P2 | M5 (API), M10 (UI) | T-BR-* |
| FR-CAT-1…3 | IN-4, ADR 017 | P3, P4 | M4 (migration), M5 | T-CAT-*, existing CMS E2E |
| FR-INV-1…3 | IN-1, IN-6, IN-7 | S20–S27 | M6 (API), M9 (UI) | T-INV-*, C-4, C-7 |
| FR-AV-1…4 | AV-1…9, OC-1…3, IN-1…5 | P5, P6 | M6 | T-AV-*, T-DATE-* |
| FR-PR-1…6 | PR-1…13 | S30–S34, P6 | M6 (API), M10 (UI) | T-PR-* |
| FR-RES-1, 2, 9, 10 | lifecycle, idempotency, PR-7 | P7 | M7 | T-RES-*, C-1…3, C-9 |
| FR-RES-3, 4 | IN-8, R-7 | S3, S4 | M7 | T-RES-*, C-5 |
| FR-RES-5…8 | lifecycle | S5–S13 | M7 | T-LIFE-*, C-6, C-10 |
| FR-GST-1…5 | ADR 019 | P9, P10, P7, S50–S53 | M7 (API), M8–M9 (UI) | T-GST-*, E2E-G-6, E2E-M-3 |
| FR-LKP-1…3 | ADR 019 | G1–G4, S14 | M7 | T-LKP-* |
| FR-OPS-1…6 | sync reminder rules (branch-model) | S1, S2, S15, S20, S28, S29, A3 | M9 | E2E-R-*, T-SYNC-* |
| FR-RPT-1…3 | FR-RPT definitions | S40–S42 | M10 | T-RPT-* |
| FR-IAM-1…3 | ADR 018 | A4 + all | M4 (model), M10 (UI) | T-AUTHZ-* sweep |
| FR-AUD-1…3 | — | S15, S43 | M4 (table), M7+ | T-AUD-* |
| FR-NTF-1…3 | outbox | — | M7 | T-NTF-* |
| FR-WEB-*, FR-CMS-*, FR-CNT-* | content model, publication rules | existing Server Actions and Route Handlers | Phases 1–10 (done); kept green every milestone | existing unit, integration, and E2E suites |
| NFR-1, 2 | ADR 016, 017 | P7, S3–S6, S23, S25 | M6–M7 | C-1…10 |
