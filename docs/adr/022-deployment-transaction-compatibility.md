# ADR 022 — Deployment compatibility for transactional reservations

Status: **Accepted** (2026-10-24; database provider choice is a Phase 12 input)

## Context

ADR 011 deploys the Next.js app as a Node process under CloudLinux Passenger on Hosting.com/cPanel. The account's PostgreSQL is v10 (end of life), so the plan is an external managed PostgreSQL 17+ ([hosting-preflight.md](../operations/hosting-preflight.md)). Passenger may run more than one Node process and restart them at will. Managed providers often front PostgreSQL with a connection pooler (PgBouncer, usually in transaction mode).

## Problem

Does the reservation design (ADR 016) hold on this deployment?

## Decision and constraints

- **No in-process state** for correctness: no in-memory locks, caches of availability, or counters. All coordination happens in PostgreSQL. This is already true of the CMS.
- **Transaction-scoped primitives only.** Row locks (`FOR NO KEY UPDATE`) and exclusion constraints work through a transaction-mode pooler because they live and die with the transaction. Session-level advisory locks, `SET` without `LOCAL`, and `LISTEN/NOTIFY` are not used.
- Prisma interactive transactions hold one connection for their duration, so they stay short: there is no network I/O such as email inside them. Emails go through an outbox row written in the transaction and are sent after commit.
- **Provider requirements** to confirm before choosing a provider in Phase 12: PostgreSQL 17+, `CREATE EXTENSION btree_gist` permitted, UTC session or per-connection `TimeZone` honoured, a direct (non-pooled) URL for `prisma migrate deploy`, point-in-time recovery, and a region near Egypt for latency.
- **Fallback if `btree_gist` is unavailable:** physical-room assignment overlap is checked under the same room-type lock as bookings. ADR 016 records this, and the concurrency test covers it.
- **Scheduled jobs** use cPanel cron with `npm run …` scripts, as `media -- cleanup` already does. The new jobs are the notification outbox retry and the expiry of idempotency keys and guest tokens.

## Options considered

Keeping the database on cPanel PostgreSQL 10 was rejected (end of life, unsupported by Prisma 7). Moving the app off cPanel is not required by this design.

## Consequences

The reservation system deploys with the existing topology, plus one extension and two cron jobs.

## Risks

- Network latency to the external database lengthens lock hold times. Mitigation: a few short statements per booking transaction; measured in M11.
- A provider pooler in statement mode would break transactions. Mitigation: listed as a provider requirement.
