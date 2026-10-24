# Business rules index

This index lists every reservation business rule with its authoritative definition, so rules are defined once and referenced everywhere.

| Prefix | Topic | Defined in |
| --- | --- | --- |
| AV-1…9 | Stay dates, today, limits | [availability-and-pricing-rules.md](./availability-and-pricing-rules.md#date-semantics-adr-020) |
| OC-1…3 | Occupancy | [availability-and-pricing-rules.md](./availability-and-pricing-rules.md#occupancy) |
| IN-1…8 | Capacity, inventory, blocks, assignment, external conflicts | [availability-and-pricing-rules.md](./availability-and-pricing-rules.md#capacity-and-availability-adr-016) |
| PR-1…13 | Pricing, snapshots, overrides | [availability-and-pricing-rules.md](./availability-and-pricing-rules.md#pricing-scope-pdf-sections-23) |
| R-1…9 | Reservation aggregate invariants | [domain-model.md](./domain-model.md#reservation-aggregate-root) |
| Lifecycle | States, transitions, references, idempotency | [reservation-lifecycle.md](./reservation-lifecycle.md) |
| GV-1…6 | Phone verification, guest profiles, blocking, retention | [domain-model.md](./domain-model.md#guest-verified-phone-profile) |
| Sync | Sync checkpoints and reminders | [domain-model.md](./domain-model.md#sync-checkpoints), [branch-model.md](./branch-model.md#sync-reminders) |
| Branch | Selection, scope, deactivation | [branch-model.md](./branch-model.md) |
| DB-1…10 | Database-enforced invariants | [database/data-model.md](../database/data-model.md#invariants-checklist) |
| Roles | Capabilities and branch scope | [user-roles-and-permissions.md](../requirements/user-roles-and-permissions.md) |

## Rules that must never be broken

1. Never sell a room-type night beyond Rivana's recorded capacity (IN-6, DB-9).
2. Never compute availability or prices with another branch's data (IN-1, DB-1).
3. Never change a stored reservation price without an explicit, authorized, audited action (PR-8, PR-10).
4. Never show guest personal data without staff authorization or the guest's token (R-8).
5. Never tell a guest a request is confirmed before staff confirm it (NFR-13, Q-02).
6. Never claim Rivana knows about PMS reservations that staff have not recorded (BR-11).
7. Never accept an online booking without a WhatsApp-verified, non-blocked phone (GV-2, GV-3).
