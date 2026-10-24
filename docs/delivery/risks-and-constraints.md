# Risks and constraints

## Constraints (verified facts)

| Constraint | Source |
| --- | --- |
| Next.js 16.3.3 App Router is the only application framework | ADR 001; brief §2 |
| PostgreSQL via Prisma 7.10 with the `@prisma/adapter-pg` driver; every connection uses `-c TimeZone=UTC` | `src/infrastructure/db/prisma/client.ts` |
| Hosting: Hosting.com cPanel, Node 22 under CloudLinux Passenger, no Docker; account PostgreSQL is v10, so an external managed PostgreSQL 17+ is needed | [hosting-preflight.md](../operations/hosting-preflight.md) |
| No PMS API or export | Brief §4 |
| CSP `default-src 'self'`, strict nonce scripts, `connect-src 'self'` | `src/infrastructure/http/security-headers.ts` |
| Local development runs Node 24.21.0; CI and deployment pin Node 22.23.2 | `.nvmrc`, Phase 1 report |
| Playwright Firefox does not launch on this Mac (macOS 27) | Phase 11 report |
| The shared hosting disk is about 99% full at provider level | hosting-preflight |

## Risks

| Id | Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- |
| RK-1 | **Cross-system double booking**: the PMS sells a room-night Rivana also sold, before staff sync | Medium to high | High | Request to book (Q-02); record-external conflict detection; reconciliation checkpoints; procedures; documented limitation | Client operations |
| RK-2 | Staff skip the procedure (no recording, late confirmation) | Medium | High | Dashboard warnings, pending ages, audit, manager weekly review, training | Manager |
| RK-3 | Oversell inside Rivana due to a code path without the lock | Low | High | Single `InventoryGuard`; concurrency tests per writer; code review checklist | Developer |
| RK-4 | Guest data exposure (IDOR, enumeration, logs) | Medium | High | Threat model controls; branch-scoped 404s; token access; log redaction; tests | Developer |
| RK-5 | Fake reservations and inventory squatting (bots or pranksters creating pending requests) | Low (with verification) | Medium | Mandatory WhatsApp phone verification; pending cap per phone; rate limits; honeypot; staff decline; Manager/Admin blocking | Developer / operations |
| RK-6 | Price or tax wording legally wrong | Medium | High | No tax wording until Q-05; client-approved text | Client |
| RK-7 | Managed database lacks `btree_gist` or has a statement-mode pooler | Low | Medium | Provider requirements in ADR 022; lock-based fallback | Developer |
| RK-8 | Email or WhatsApp not configured, so guests get no codes or messages | Medium | High (no WhatsApp means no online booking) | SMTP and the WhatsApp sender are launch blockers; on-screen reference; staff resend | Client / developer |
| RK-9 | Scope creep (payments, accounts, WhatsApp) | High | Medium | BR-12; separate approvals | Client / developer |
| RK-10 | Regressing the accepted CMS | Low | High | Additive migrations; full existing suites every milestone | Developer |
| RK-11 | Prisma drift with SQL-only constraints | Medium | Low | Drift check per migration; move composite FKs into the schema if needed | Developer |
| RK-12 | Joint launch (Q-16, decided): the new website stays unreleased until reservations pass M11, and the old WordPress site stays live longer | High (certain delay) | Medium | Provision Phase 12 infrastructure and staging early; keep Phase 11 accepted and the CMS release-ready; per-branch `onlineBookingEnabled` remains an emergency off switch after launch | Client |
| RK-13 | Disk-full on shared host affects logs and uploads | Low | Medium | Free-space alert (Phase 12) | Operator |
| RK-14 | Indefinite retention of guest personal data conflicts with privacy obligations (Egypt PDPL, guests' home countries) | Medium | Medium | Owner decision recorded (Q-13); privacy notice states it (Q-30); client to obtain legal advice before launch | Client |
| RK-15 | WhatsApp Business setup (Meta business verification, number, template approval) is slow or rejected, or messaging costs rise through abuse | Medium | High | Start the setup during M4–M6 (Q-10); provider stays behind `WhatsAppSender`; rate limits and volume alerts | Client / developer |
| RK-16 | Receptionists answer "I have synced" without syncing | Medium | High | Each answer is audited with name and time; manager weekly review compares checkpoints with conflicts found | Manager |
