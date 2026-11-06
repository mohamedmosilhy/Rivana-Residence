# ADR 022 — Deployment compatibility for transactional reservations

Status: **Accepted** (2026-10-24; database provider choice is a Phase 12 input)

## Context

ADR 023 deploys the Next.js app as a Node process under systemd on a Hostinger VPS, behind Nginx. PostgreSQL 17+ runs on the same VPS by default, or on a managed service ([hosting-preflight.md](../operations/hosting-preflight.md)). More than one Node process can be live at once: the old and new release overlap during a deploy, systemd restarts the process at will, and a second instance may be added later. Managed providers often front PostgreSQL with a connection pooler (PgBouncer, usually in transaction mode).

## Problem

Does the reservation design (ADR 016) hold on this deployment?

## Decision and constraints

- **No in-process state** for correctness: no in-memory locks, caches of availability, or counters. All coordination happens in PostgreSQL. This is already true of the CMS.
- **Transaction-scoped primitives only.** Row locks (`FOR NO KEY UPDATE`) and exclusion constraints work through a transaction-mode pooler because they live and die with the transaction. Session-level advisory locks, `SET` without `LOCAL`, and `LISTEN/NOTIFY` are not used.
- Prisma interactive transactions hold one connection for their duration, so they stay short: there is no network I/O such as email inside them. Emails go through an outbox row written in the transaction and are sent after commit.
- **Database requirements**, whether PostgreSQL runs on the VPS or at a managed provider, confirmed in Phase 12: PostgreSQL 17+, `CREATE EXTENSION btree_gist` permitted, UTC session or per-connection `TimeZone` honoured, a direct (non-pooled) URL for `prisma migrate deploy`, point-in-time recovery (WAL archiving when self-hosted), and, for a managed service, a region next to the VPS.
- **Fallback if `btree_gist` is unavailable:** physical-room assignment overlap is checked under the same room-type lock as bookings. ADR 016 records this, and the concurrency test covers it.
- **Scheduled jobs** use the app user's cron on the VPS with `npm run …` scripts, as `media -- cleanup` already does. The new jobs are the notification outbox retry and the expiry of idempotency keys and guest tokens.

## Options considered

Keeping the database on the Hosting.com cPanel account's PostgreSQL 10 was rejected (end of life, unsupported by Prisma 7). That account is no longer the deployment target (ADR 023). On the VPS, PostgreSQL on the same server avoids both the pooler and the network latency below.

## Consequences

The reservation system deploys on the ADR 023 topology, plus one extension and two cron jobs.

## Risks

- Network latency to a managed database lengthens lock hold times. Mitigation: a few short statements per booking transaction; measured in M11.
- A provider pooler in statement mode would break transactions. Mitigation: listed as a provider requirement.
