# M15 — Joint launch and operational handover

Status: **Not started.** Runs together with roadmap Phase 12.3–12.5 ([roadmap](../roadmap.md#phase-12--deployment-and-launch)). Follow the [milestone loop](./README.md#the-loop-every-milestone-follows) where it applies; most steps are operational.

## Objective

Launch the branch websites, online booking with Paymob and pay at hotel, staff tools, and WhatsApp messaging together (Q-16), and hand over operations.

## Read first

- [operations/deployment.md](../../operations/deployment.md), [operations/hosting-preflight.md](../../operations/hosting-preflight.md), ADR [023](../../adr/023-hostinger-vps-deployment.md)
- [operations/manual-synchronization-procedure.md](../../operations/manual-synchronization-procedure.md), [operations/receptionist-procedures.md](../../operations/receptionist-procedures.md), [operations/known-limitations.md](../../operations/known-limitations.md)
- The M14 release-candidate report and release checklist

## Blocking questions (must be answered before go-live)

Q-13 (confirmed with legal advice), Q-21, Q-23, Q-24, Q-25, Q-30 (all guest-facing text). Setup data from the client: live Paymob keys (Q-55), the WhatsApp Business number and approved templates entered by the Admin (Q-67), and the VAT rate entered by the Admin (Q-05).

## Skills for this milestone

| Step | Skill | Notes |
| --- | --- | --- |
| Checklist and runbook updates | — | Written by hand from the M14 draft |
| Smoke-test fixes | `/debug`, `/test` | Release-blocking fixes only |
| Launch notes | `/document` (`release-note`) | |
| After launch | `/sync` | |

## Tasks

1. Production database migrated (`npm run db:deploy`) after a backup.
2. Data entered: branches (content, map, check-in times), listings with type, units (Q-23), rates, services, VAT rate by the Admin (Q-05), WhatsApp number and templates by the Admin with a successful test message (Q-67), staff and assignments (Q-24).
3. Cron jobs: outbox, hold expiry, payment reconciliation, token expiry, media cleanup.
4. Paymob live keys (from the client) in the server environment and the callback URL registered; WhatsApp access token in the server environment and the Admin's test message delivered; SMTP verified.
5. Training: immediate confirmation and its PMS risk; marking website bookings entered in the hotel system; handling a conflict with an already confirmed (possibly paid) guest; cancellation approvals and refunds; sync reminder; blocking numbers; broadcasts and consent.
6. Enable `onlineBookingEnabled` per branch that passed M14.
7. Monitor the first week: PMS-entry ages, conflicts, payment failures, refunds, message failures.

## Acceptance criteria

1. Staff trained and acknowledged in writing.
2. Reconciliation run for two consecutive days without unresolved differences.
3. Rollback rehearsed: online booking switched off per branch leaves the site honest.
4. A live low-value Paymob payment and its refund verified end to end.
5. Phase 12 acceptance criteria met.

## Handoff

Production acceptance or a rollback and fix plan.
