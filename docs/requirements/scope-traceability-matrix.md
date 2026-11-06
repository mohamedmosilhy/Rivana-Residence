# Scope traceability matrix

## 1. Scope PDF → new plan

The PDF (`docs/source/Rivana_Residence_Project_Scope.pdf`, 7 pages, v1.0, 15 Aug 2026) was extracted and read in full on 2026-10-24. Classification: **R** retained unchanged, **M** retained with modifications, **X** replaced by the manual reservation workflow, **D** deferred or not in this release, **✓** already delivered by Phases 0–11.

| PDF § | Item | Class | Where it lands |
| --- | --- | --- | --- |
| 1 | Rebuild site with the same design (Home, About, Rooms, Room details, Amenities, Contact) | ✓ | Phases 1–10 |
| 1 | Terms & Conditions, Cancellation/Refund pages | D | Content pages per branch once the client supplies text (Q-30); the cancellation rule itself is decided (Q-38) |
| 1 | Booking/reservation flow | M | Self-managed journey with immediate confirmation, M8–M10 |
| 1 | Content and images editable from the dashboard | ✓ | CMS |
| 2 | Add/edit rooms, images, capacity, amenities, enable/disable | ✓ / M | Existing CMS; listings gain a branch and a Room or Apartment type (FR-CAT-1/2) |
| 2 | Set room prices; period prices; seasonal/date pricing applied automatically | M | FR-PR-1/2, PR-2…4 (one kind of date period, Q-44), M6 |
| 3 | Offers with validity applied automatically | M | Coupon codes with validity (FR-CPN, Q-48), M7; date periods for seasonal prices (Q-44) |
| 3 | Loyalty offers for registered customers | D | Needs accounts (BR-12) |
| 4 | Select dates and guests, view available rooms, see price, enter details, submit, confirmation | M | FR-AV, FR-RES-1/2 with immediate confirmation (Q-36), M8–M10 |
| 4 | Availability through the hotel's API | **X** | Rivana's own inventory (ADR 013, 016) |
| 4 | Send reservation to the hotel's system | **X** | Staff enter each confirmed website booking in the PMS and mark it entered (FR-OPS-7, Q-40) |
| 4 | Reservation appears in our dashboard | R | FR-OPS-2/3 |
| 4 | Handle availability changing between check and request | R | ADR 016 lock; `PRICE_CHANGED`/`INVENTORY_UNAVAILABLE` |
| 4 | Online payment (Stripe/Paymob) | M | Paymob hosted checkout, holds, refunds (FR-PAY, ADR 025, Q-37), M9 |
| 4 | Pay on arrival; stored with the reservation | M | `PAY_AT_HOTEL` as a guest choice and for staff bookings; "hotel system integration" part **X** |
| 5 | Email verification/confirmation | M | Confirmation emails after commit (FR-NTF-1, Q-53) |
| 5 | WhatsApp | M | Verification codes, confirmations, feedback requests, consented offers (FR-GST-1, FR-NTF-1, FR-MKT; Q-28, Q-32, Q-50, Q-51) |
| 5 | Verification before confirmation, to be finalized | M | WhatsApp phone verification before submission; immediate confirmation (Q-36; supersedes request to book, Q-02) |
| 6 | Customer accounts, history, loyalty, targeted offers | M | Verified phone profiles with history; "My reservations" by phone and code; no passwords; loyalty deferred (ADR 019, Q-27); targeted offers as consented WhatsApp broadcasts (FR-MKT) |
| 7 | One dashboard, role permissions | R | Existing `/admin` shell, extended (ADR 018) |
| 7 | Receptionist: view, accept/decline, customer info, availability, workflow; no prices, settings, or content | M | Capability matrix; accept/decline replaced by immediate confirmation and "entered in hotel system" (Q-36, Q-40) |
| 7 | Manager: + prices, statistics, occupancy, performance | M | Capability matrix; FR-RPT; plus services, coupons, cancellation decisions, broadcasts |
| 7 | Admin: everything, plus users, roles, branches, settings | R | Capability matrix; FR-BR, FR-IAM |
| 7 | Admin: manage the external reservation system integration | **X** | No integration; `HotelSystemSync` port reserved |
| 7 | Admin: manage customers | M | Guest profiles: search, history, block or unblock a phone number (FR-GST-3/4; Admin and Manager, Q-29) |
| 8 | Multiple branches with info, images, rooms, prices, offers, contact | M | ADR 017, ADR 026: branch-owned websites, listings, prices, services, maps (Q-41, Q-42, Q-52) |
| 8 | Branch subdomains example | D | Path-based `/{branch}/…` (Q-41); subdomains not approved |
| 9 | Own accounts, role-based permissions | ✓ / M | Better Auth plus new roles |
| 9 | Records of important management actions | M | `AuditEvent` for reservations, prices, inventory, access; CMS content later (Q-15) |
| 10 | Statistics: counts, confirmed, cancelled/declined, occupancy, room performance, revenue, trends | R | FR-RPT, M10 |
| 11 | Open points (PMS API, prices source, WhatsApp, providers, payment, cancellation rules, permissions, statistics, subdomains, loyalty, self-service cancel) | M | [assumptions-and-open-questions.md](./assumptions-and-open-questions.md); payment, cancellation requests, and subdomains decided 2026-11-06 |

**New requirements not in the PDF:** manual-sync procedures with 30-minute sound and pop-up reminders (BR-11, FR-OPS-6), PMS-entry tracking (FR-OPS-7), phone blocking (BR-19), external-reservation recording (FR-RES-4), maintenance blocks (FR-INV-2), physical-unit inventory and assignment (FR-INV-1, FR-RES-8), check-in, check-out, and no-show, idempotency, a secure guest link, sync checkpoints, and, from the client decisions of 2026-11-06: branch websites and chooser (FR-SITE), hotel apartments (FR-CAT-2/3), optional services (FR-SVC), coupons (FR-CPN), VAT (FR-TAX), cancellation requests and refunds (FR-CXL, FR-PAY), per-branch maps (FR-SITE-7), and WhatsApp marketing and feedback (FR-MKT). The promotion popup (PDF §3 "offers" as implemented in Phase 5–7) is retired (Q-47).

## 2. Requirement → rules → API → milestone → tests

Milestones refer to the replanned roadmap (2026-11-06). Test ids are in [../testing/test-matrix.md](../testing/test-matrix.md).

| Requirement | Rules | API | Milestone | Tests |
| --- | --- | --- | --- | --- |
| FR-SITE-1…8 | ADR 026, branch-model | P1, P2 | M4 (data), M5 | T-SITE-*, E2E-S-* |
| FR-BR-1…4 | branch-model | A1–A3, P1, P2 | M4 (data), M5 (API), M12 (UI) | T-BR-* |
| FR-CAT-1…5 | IN-4, ADR 017, ADR 026 | P3, P4 | M4 (columns), M5 | T-CAT-*, E2E-S-3 |
| FR-INV-1…3 | IN-1, IN-6, IN-7 | S20–S27 | M6 (API), M11 (UI) | T-INV-*, C-4, C-7 |
| FR-AV-1…4 | AV-1…9, OC-1…3, IN-1…5 | P5 | M6 | T-AV-*, T-DATE-* |
| FR-PR-1…6 | PR-1…13 | S30–S34, P6 | M6 (rates), M7 (quote), M12 (UI) | T-PR-*, T-QUOTE-* |
| FR-SVC-1…4 | SV-1…4 | S35, S36, P6 | M7 (API), M10, M12 (UI) | T-SVC-* |
| FR-CPN-1…6 | CP-1…7 | S37–S39, P6, P7 | M7, M8 (redemption), M10, M12 (UI) | T-CPN-*, C-11 |
| FR-TAX-1…3 | TX-1…5 | A5, P6 | M7, M12 (UI) | T-TAX-* |
| FR-RES-1, 2, 9, 10, 11 | lifecycle, idempotency, PR-7 | P7 | M8 (pay at hotel), M9 (online) | T-RES-*, C-1…3, C-9 |
| FR-RES-3, 4 | IN-8, R-7 | S3, S4 | M8 | T-RES-*, C-5 |
| FR-RES-5…8 | lifecycle | S5, S6, S9–S13, S16 | M8 | T-LIFE-*, C-6, C-10 |
| FR-PAY-1…8 | PY-1…8, ADR 025 | P7, P8, S44, S45 | M9 | T-PAY-*, C-12…14 |
| FR-CXL-1…7 | CX-1…7 | G2, G4, S9, S17–S19 | M9 (API), M10–M11 (UI) | T-CXL-*, E2E-G-6, E2E-M-6 |
| FR-GST-1…6 | ADR 019, GV-1…6 | P9, P10, P7, S50–S53 | M8 (API), M10–M11 (UI) | T-GST-*, E2E-G-5, E2E-M-3 |
| FR-LKP-1…3 | ADR 019 | G1–G4, S14 | M8 | T-LKP-* |
| FR-OPS-1…8 | sync reminder rules (branch-model) | S1, S2, S15–S20, S28, S29, A3 | M8–M9 (API), M11 (UI) | E2E-R-*, T-SYNC-* |
| FR-RPT-1…3 | FR-RPT definitions | S40–S42 | M12 | T-RPT-* |
| FR-MKT-1…6 | ADR 028 | P7 (consent), S60–S62 | M8 (consent), M13 | T-MKT-*, E2E-M-5 |
| FR-IAM-1…3 | ADR 018 | A4 + all | M4 (model), M12 (UI) | T-AUTHZ-* sweep |
| FR-AUD-1…3 | — | S15, S43 | M4 (table), M6+ | T-AUD-* |
| FR-NTF-1…4 | outbox, ADR 028 | — | M8, M9, M13 | T-NTF-*, T-WA-* |
| FR-WEB-*, FR-CMS-*, FR-CNT-* | content model, publication rules | existing Server Actions and Route Handlers | Phases 1–11 (done); branch move M5; FR-WEB-8 and FR-CMS-6 retired M5 | existing suites, updated in M5 |
| NFR-1, 2 | ADR 016, 017, 025, 027 | P7, P8, S3–S6, S23, S25 | M6–M9 | C-1…14 |
| NFR-19 | ADR 025 | P8 | M9, M14 | T-PAY-*, security tests |
