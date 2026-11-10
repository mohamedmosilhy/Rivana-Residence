# Hosting preflight (Hostinger VPS)

Production and staging run on a Hostinger KVM VPS ([ADR 023](../adr/023-hostinger-vps-deployment.md)). The VPS is **not yet provisioned**. This checklist is completed in Phase 12.1, and its results are recorded here. Hostnames, IP addresses, usernames, keys, and secrets are never written in the repository.

## Plan and server

- [ ] Choose a KVM plan with at least 2 vCPU, 8 GB RAM, and enough NVMe disk for PostgreSQL, the media root, logs, and several releases, with room to grow. `next build` and sharp need memory headroom.
- [ ] Pick the data centre closest to Egypt and measure latency from Egypt.
- [ ] Install a current Ubuntu LTS template and confirm `x86_64` and glibc ≥ 2.28 (sharp 0.35's minimum).
- [ ] Confirm Hostinger's included backups and snapshots, their frequency and retention, and the price of more frequent backups.

## Access and hardening

- [ ] SSH with a dedicated deployment key only; password and root login disabled.
- [ ] Hostinger firewall and `ufw` allow only SSH, HTTP, and HTTPS.
- [ ] Unattended security upgrades, `fail2ban`, and time sync (UTC system clock).
- [ ] Separate OS users for the app and for backups.

## Runtime

- [ ] Node 26.13.0 LTS (the `.nvmrc` version) installed system-wide from a pinned source; `node -v` checked as the app user.
- [ ] Linux `libatomic` runtime library is available for the official Node 26 binary; systemd and cron use the same pinned Node and npm 11 runtime.
- [ ] A systemd service runs `next start` on `127.0.0.1`, restarts on failure, and reads its environment from a root-owned file readable only by the app user.
- [ ] Nginx proxies to the app, serves TLS, redirects HTTP to HTTPS, sets `X-Forwarded-For`, and allows the upload body size the media policy needs.
- [ ] Release layout (`releases/<id>` plus a `current` symlink) and the restart command proven with a dummy release and a rollback.
- [ ] App user's crontab runs `npm run media -- cleanup` hourly, plus the reservation jobs from M8 and M9 (outbox, hold expiry every minute, payment reconciliation, token expiry).
- [ ] Nginx passes `POST /api/v1/payments/paymob/callback` to the app unchanged (no body rewriting, so the HMAC can be verified), and the callback URL is registered in the Paymob dashboard for staging (test keys) and production (live keys) separately.

## Database

Decide Q-25: PostgreSQL on the VPS (default) or a managed service. Either way, confirm the ADR 022 requirements.

- [ ] PostgreSQL 18 (17 minimum) from the PostgreSQL project's packages, listening on localhost only.
- [ ] `CREATE EXTENSION btree_gist` works.
- [ ] Separate runtime and migration roles, and a direct URL for `prisma migrate deploy`.
- [ ] WAL archiving off the server for point-in-time recovery, in addition to nightly `scripts/backup.sh`.
- [ ] `pg_dump`, `pg_restore`, and `psql` are at least as new as the server.

## Media

- [ ] Media root (for example `/var/lib/rivana/media`) with a `quarantine/` subfolder, mode `750`, owned by the app user, outside every release directory and outside any Nginx root.
- [ ] The storage adapter's operations work there: exclusive create, a same-filesystem hard link from quarantine into `images/`, refusal to overwrite an existing key, and new files created with mode `640`.
- [ ] Images are served only through the application `/media/` route.
- [ ] `MEDIA_STORAGE_ROOT` set to that absolute path in the service environment.

## Backups and monitoring

- [ ] Nightly `scripts/backup.sh` copied to storage outside Hostinger, and a restore drill with `scripts/restore.sh` into a scratch database and media root.
- [ ] Alerts on free disk space, memory, the service being down, and the public site (uptime check).

## Domains and staging

- [ ] DNS stays in the client's Cloudflare zone. The client must regain access to that account before records change. Do not move nameservers or add the domain to a different Cloudflare account as a workaround.
- [ ] `staging.rivanaresidence.com` gets its own systemd service, Nginx site with `X-Robots-Tag: noindex, nofollow, noarchive` and a disallowing `robots.txt`, database, database role, and media root.
- [ ] Production gets its own media root and credentials; staging can never write to them.

## Earlier target: Hosting.com cPanel (dropped 2026-10-24)

ADR 011 planned to use the client's shared Hosting.com cPanel account. A read-only preflight on 2026-09-25 found:

- PostgreSQL 10 only (end of life, unsupported by Prisma 7);
- Node 22 only through the CloudLinux selector, with Node 10 as the login default, and no Docker;
- the provider's shared disk at 99% use;
- an account shared with other live sites.

These findings led to ADR 023. A staging subdomain (`staging.rivanaresidence.com`, serving the static reference build) and a staging media root were created on that account on 2026-09-25 for review and the Phase 6 storage checks. They are no longer part of the plan. Remove them only after confirming with the client, because the account also hosts other sites.
