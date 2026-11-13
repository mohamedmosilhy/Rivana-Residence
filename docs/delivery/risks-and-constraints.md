# Risks and constraints

## Constraints (verified facts)

| Constraint | Source |
| --- | --- |
| Next.js 16.4.5 App Router is the only application framework | ADR 001; brief §2; F01 dependency security repair |
| PostgreSQL via Prisma 7.10 with the `@prisma/adapter-pg` driver; every connection uses `-c TimeZone=UTC` | `src/infrastructure/db/prisma/client.ts` |
| Hosting: a Hostinger VPS with Node 26.13.0 LTS under systemd behind Nginx, PostgreSQL 17+, and local media (not yet provisioned) | [ADR 023](../adr/023-hostinger-vps-deployment.md), [hosting-preflight.md](../operations/hosting-preflight.md) |
| No PMS API or export | Brief §4 |
| CSP `default-src 'self'`, strict nonce scripts, `connect-src 'self'` | `src/infrastructure/http/security-headers.ts` |
| Local development, CI, and deployment target Node 26.13.0 LTS; verify the service and cron runtime during deployment rehearsal | `.nvmrc`, `.node-version`, `package.json`, owner decision 2026-11-10 |
| Playwright Firefox does not launch on this Mac (macOS 27) | Phase 11 report |

## Risks

| Id | Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- |
| RK-1 | **Cross-system double booking**: the PMS sells a room-night Rivana also sold, before staff sync. **Raised on 2026-11-06**: website bookings are now confirmed (and possibly paid) immediately with no human check of the PMS (Q-36), so a conflict reaches a guest who already holds a confirmation, and late manual sync directly increases the chance | High | High | 30-minute sync reminders and checkpoints; record PMS bookings within 30 minutes; PMS-entry marker and target on every website booking (Q-40, Q-61); record-external conflict detection; conflict procedure with relocation or cancellation and refund; switch online booking off per branch when the PMS is down or sync falls behind; documented limitation L-1a | Client operations |
| RK-2 | Staff skip the procedure (no recording, website bookings not entered in the PMS) | Medium | High | Overview list of unentered bookings with age highlight, sync pop-up count, audit, manager weekly review, training | Manager |
| RK-3 | Oversell inside Rivana due to a code path without the lock | Low | High | Single `InventoryGuard`; concurrency tests per writer; code review checklist | Developer |
| RK-4 | Guest data exposure (IDOR, enumeration, logs) | Medium | High | Threat model controls; branch-scoped 404s; token access; log redaction; tests | Developer |
| RK-5 | Fake reservations and inventory squatting: pay-at-hotel bookings are now confirmed at once, and payment holds reserve units for 15 minutes | Medium | Medium | Mandatory WhatsApp phone verification; caps on upcoming pay-at-hotel bookings and open holds per phone (Q-60); hold expiry; rate limits; honeypot; staff cancellation; Manager/Admin blocking | Developer / operations |
| RK-6 | VAT rate entered wrongly, or refund and cancellation terms legally wrong | Medium | High | The Admin owns the VAT rate, which starts at 15% and can be set from 0% to 100% (Q-05 amended 2026-11-11); changes audited and never alter existing bookings; neutral "VAT (n%)" label; client-approved terms (Q-30); the client confirms the rate before launch | Client |
| RK-7 | Managed database lacks `btree_gist` or has a statement-mode pooler | Low | Medium | Provider requirements in ADR 022; lock-based fallback | Developer |
| RK-8 | Email or WhatsApp not configured, so guests get no codes or messages | Medium | High (no WhatsApp means no online booking) | SMTP and the WhatsApp sender are launch blockers; on-screen reference; staff resend | Client / developer |
| RK-9 | Scope creep (accounts, other payment methods, partial refunds, currency conversion, more marketing features) | High | Medium | BR-12; separate approvals; milestone briefs with binding out-of-scope lists | Client / developer |
| RK-10 | Regressing the accepted CMS | Low | High | Additive migrations; full existing suites every milestone | Developer |
| RK-11 | Prisma drift with SQL-only constraints | Medium | Low | Drift check per migration; move composite FKs into the schema if needed | Developer |
| RK-12 | Joint launch (Q-16, decided): the new website stays unreleased until the whole product passes M14, now a longer plan (M4–M15) with payments, branch sites, and messaging, and the old WordPress site stays live longer | High (certain delay) | Medium | Provision Phase 12 infrastructure and staging early; keep Phase 11 accepted and the CMS release-ready; per-branch `onlineBookingEnabled` remains an emergency off switch after launch | Client |
| RK-13 | A full VPS disk stops the database, logs, and uploads | Low | Medium | Free-space alert (Phase 12) | Operator |
| RK-14 | Indefinite retention of guest personal data conflicts with privacy obligations (Egypt PDPL, guests' home countries) | Medium | Medium | Owner decision recorded (Q-13); privacy notice states it (Q-30); client to obtain legal advice before launch | Client |
| RK-15 | WhatsApp Business setup (Meta business verification, number, template approval) is slow or rejected, template names entered by the Admin do not match Meta, or messaging costs rise through abuse | Medium | High | Start the setup during M4–M6 (Q-10); provider stays behind `WhatsAppSender`; rate limits and volume alerts | Client / developer |
| RK-16 | Receptionists answer "I have synced" without syncing | Medium | High | Each answer is audited with name and time; manager weekly review compares checkpoints with conflicts found | Manager |
| RK-17 | Paymob keys (sandbox for M9, live for launch) arrive late (Q-55). USD charging is confirmed (Q-54) | Medium | Medium | Fake gateway until M9; M9 starts when the sandbox keys arrive; pay at hotel still works | Client |
| RK-18 | Payment state wrong: forged, lost, duplicate, or late callbacks; refund failures | Low (with controls) | High | HMAC and amount checks; idempotent event processing; reconciliation job; late-success rule; refund retry; concurrency tests C-12…C-14 | Developer |
| RK-19 | Coupon abuse or limit breaches | Medium | Medium | Rate limits; coupon row lock; per-phone and total limits; branch scope; audit | Developer / Manager |
| RK-20 | WhatsApp marketing sent without valid consent, or templates rejected | Medium | Medium | Opt-in recorded with wording version; opt-out honored; blocked numbers excluded; tests per exclusion; marketing independent of booking (ADR 028); consent wording from the client (Q-58) | Client / developer |
| RK-21 | Branch URL move harms search ranking or breaks old links | Low | Medium | Single-hop permanent redirects, canonicals, per-branch sitemap, redirect tests (M5) | Developer |
| RK-22 | Refund approvals delayed (Managers not available), so guests wait | Medium | Medium | Request queue on the overview; messages to guests; Admin can decide for any branch | Manager |
