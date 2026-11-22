# M15 — Joint launch and operational handover

Status: **Not started.** Runs together with roadmap Phase 12.3–12.5 ([roadmap](../roadmap.md#phase-12--deployment-and-launch)). Follow the [milestone loop](./README.md#the-loop-every-milestone-follows) where it applies; most steps are operational.

## Objective

Launch the branch websites, online booking (online payment and pay at hotel), staff tools, and WhatsApp and email messaging together (Q-16), and hand over operations. **This is where the three providers are plugged in** (ADR 030, Q-92): the client has chosen the payment gateway, the WhatsApp provider, and the email provider by then, and each real adapter is written, contract tested, and sandbox tested before go-live.

## Read first

- [operations/deployment.md](../../operations/deployment.md), [operations/hosting-preflight.md](../../operations/hosting-preflight.md), ADR [023](../../adr/023-hostinger-vps-deployment.md)
- [operations/manual-synchronization-procedure.md](../../operations/manual-synchronization-procedure.md), [operations/receptionist-procedures.md](../../operations/receptionist-procedures.md), [operations/known-limitations.md](../../operations/known-limitations.md)
- The M14 release-candidate report and release checklist

## Blocking questions (must be answered before go-live)

Q-13 (confirmed with legal advice), Q-21, Q-23, Q-24, Q-25, Q-30 (all guest-facing text, including the website analytics description in the privacy notice, ADR 029, and the guest change terms, Q-83…Q-85). Setup data from the client: the chosen payment gateway, WhatsApp provider, and email provider with their live credentials (server environment only; Q-92), the WhatsApp Business number and approved templates entered by the Admin (Q-67), and the VAT rate confirmed or changed by the Admin (it starts at 15%, Q-05).

## Skills for this milestone

| Step | Skill | Notes |
| --- | --- | --- |
| Checklist and runbook updates | — | Written by hand from the M14 draft |
| Smoke-test fixes | `/debug`, `/test` | Release-blocking fixes only |
| Launch notes | `/document` (`release-note`) | |
| After launch | `/sync` | |

## Task breakdown

Planned, reviewed, and accepted one task at a time ([agent-workflow.md](../../engineering/agent-workflow.md)). Rows are confirmed at milestone open; the numbered **Tasks** below hold the detail. This table is provisional: re-confirm it against the code and decisions at milestone open.

| Task | Title | Risk | Depends on | Covers (criteria, tests) | Status |
| --- | --- | --- | --- | --- | --- |
| M15-T1 | Production database migrated after a backup | Critical | M14 | AC 5 | Not started |
| M15-T2 | Production data entry (with the owner and client) | Critical | T1 | AC 5 | Not started |
| M15-T3 | Cron jobs | Medium | T1 | AC 2 | Not started |
| M15-T4a | Payment gateway adapter for the chosen provider: write it, pass the payment contract suite, run its sandbox (pay, fail, abandon, late success, refund), register the callback URL, set `PAYMENT_PROVIDER` and its secrets ([guide](../../architecture/provider-adapters.md)) | Critical | T1 | AC 4 | Not started |
| M15-T4b | WhatsApp provider: Meta Cloud API adapter (exists) or a new adapter for the chosen provider, pass the contract suite, set `WHATSAPP_PROVIDER` and the token, Admin test message delivered | Critical | T1 | AC 4 | Not started |
| M15-T4c | Email provider: SMTP (exists) or a new adapter, pass the contract suite, set `EMAIL_PROVIDER` and its secrets, test email and an email verification code delivered | Critical | T1 | AC 4 | Not started |
| M15-T5 | Staff training | Low | T2 | AC 1 | Not started |
| M15-T6 | Enable online booking per branch | Critical | T2–T5 | AC 3, 4 | Not started |
| M15-T7 | First-week monitoring | Medium | T6 | AC 2 | Not started |

## Tasks

1. Production database migrated (`npm run db:deploy`) after a backup.
2. Data entered: branches (content, map, check-in times), listings with type, units (Q-23), rates, services, VAT rate confirmed by the Admin (starts at 15%, Q-05), WhatsApp number and templates by the Admin with a successful test message (Q-67), staff and assignments (Q-24).
3. Cron jobs: outbox, hold expiry, payment reconciliation, token expiry, media cleanup.
4. Plug in the three chosen providers (M15-T4a, T4b, T4c, steps in [provider-adapters.md](../../architecture/provider-adapters.md)): a real adapter behind each port passing its contract suite and the provider's sandbox; live credentials in the server environment only; the payment callback URL registered; the Admin's WhatsApp test message and a test email delivered; `fake` is not used in production. Until each is plugged in, its feature stays off with a clear setup gap.
5. Training: immediate confirmation and its PMS risk; marking website bookings entered in the hotel system; handling a conflict with an already confirmed (possibly paid) guest; cancellation approvals and refunds; sync reminder; blocking numbers; broadcasts and consent.
6. Enable `onlineBookingEnabled` per branch that passed M14.
7. Monitor the first week: PMS-entry ages, conflicts, payment failures, refunds, message failures.

## Acceptance criteria

1. Staff trained and acknowledged in writing.
2. Reconciliation run for two consecutive days without unresolved differences.
3. Rollback rehearsed: online booking switched off per branch leaves the site honest.
4. Each chosen provider is plugged in and verified: a live low-value online payment and its refund end to end, a WhatsApp message delivered through the Admin test, and email delivered (including a verification code).
5. Phase 12 acceptance criteria met.

## Handoff

Production acceptance or a rollback and fix plan.
