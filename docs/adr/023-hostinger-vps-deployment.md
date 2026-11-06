# ADR 023 — Hostinger VPS deployment

Status: **Accepted** (2026-10-24). Supersedes [ADR 011](./011-deployment.md).

## Context

ADR 011 planned to deploy on the client's existing Hosting.com shared cPanel account. The read-only preflight on that account found blockers and risks: PostgreSQL 10 only (end of life, unsupported by Prisma 7), Node 22 only through the CloudLinux selector, no Docker, a provider disk at 99% use, and an account shared with unrelated live sites. The client wants a deployment that is easy to run and reliable, and chose between Vercel and Hostinger.

The implemented design depends on a normal, long-running Node server with a persistent disk: local media storage (ADR 005), the on-disk public content cache, `npm run …` scheduled jobs, and the `scripts/backup.sh`/`scripts/restore.sh` tooling (Phase 11).

## Decision

Deploy Rivana on a **Hostinger KVM VPS** used only for Rivana, running a current Ubuntu LTS release.

- **Application:** `next start` on Node 22.23 (the `.nvmrc` version), one process run by a systemd service as a dedicated unprivileged user, restarted on failure. It listens on `127.0.0.1` only.
- **Reverse proxy:** Nginx terminates TLS (Let's Encrypt, or a Cloudflare origin certificate when the zone is proxied), redirects HTTP to HTTPS, sets upload body limits, and sets `X-Forwarded-For`, so `AUTH_TRUST_PROXY_HEADERS=true`.
- **Database:** PostgreSQL 17+ that meets ADR 022. The default is PostgreSQL 18 on the same VPS from the PostgreSQL project's packages (`btree_gist` comes with contrib, there is no pooler, and lock hold times have no network latency). A managed PostgreSQL service near the VPS stays an option if the client prefers paying for managed backups and point-in-time recovery. The final choice is made in Phase 12 (Q-25).
- **Media:** unchanged from ADR 005: a persistent directory on the VPS outside every release directory, served through the application `/media/` route.
- **Scheduled jobs:** the app user's crontab (or systemd timers) runs the `npm run …` job scripts.
- **Deploys:** CI runs the quality gates. A deploy uploads a versioned release over SSH, installs and builds it, runs `prisma migrate deploy` once, switches a `current` symlink, and restarts the service. Earlier releases are kept for rollback.
- **Staging:** a separate service, database, database role, media root, and Nginx site (`noindex`) on the same VPS, or on a second small VPS if resources are tight.
- **Region:** the Hostinger data centre closest to Egypt that is available, confirmed in the preflight.

## Reasoning

A VPS keeps every implemented design working with no code change. Root access allows a current PostgreSQL, and the server's resources are not shared with other sites. The cost is a flat monthly fee. Deploying stays simple: one server, one service, and one script.

## Alternatives considered

- **Hosting.com shared cPanel (ADR 011):** rejected for the preflight findings above.
- **Vercel with managed PostgreSQL and object storage:** the easiest deploys, with preview environments, but there is no persistent disk. It would need an object-storage `MediaStorage` adapter, Route Handler endpoints for the scheduled jobs, a different public cache, and serverless connection handling, and it adds extra services with usage-based cost. It remains a possible later move because storage, email, and the database sit behind ports.
- **Hostinger shared or managed Node.js hosting:** less server upkeep, but no root access, so no PostgreSQL 17+ and limited control over processes and cron. These are the same limits that ruled out cPanel.
- **Docker on the VPS:** available, but not needed for one Node process. systemd is simpler to operate. Containers can be added later without changing the application.

## Consequences

- We operate the server: security updates (unattended upgrades), the firewall (Hostinger firewall plus `ufw`, allowing only SSH, HTTP, and HTTPS), SSH keys only, `fail2ban`, disk and memory alerts, and PostgreSQL minor updates.
- One server is a single point of failure for the app, the media, and, by default, the database. Off-server backups and a restore drill are mandatory (`scripts/backup.sh`, `scripts/restore.sh`). Hostinger snapshots are an extra layer, never the only copy.
- DNS stays in the client's Cloudflare zone. The client still needs to regain access to it before public DNS changes.
- The provisioning checklist is in [hosting-preflight.md](../operations/hosting-preflight.md), and the runbook is in [deployment.md](../operations/deployment.md).
