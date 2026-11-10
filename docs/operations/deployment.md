# Deployment

## Initial topology

Planned in [ADR 023](../adr/023-hostinger-vps-deployment.md); not yet provisioned.

- **Server:** a Hostinger KVM VPS used only for Rivana, running a current Ubuntu LTS release, in the data centre closest to Egypt.
- **Application:** Next.js 16 production server (`next start`) on Node 22.23, one process run by a systemd service as a dedicated unprivileged user, listening on `127.0.0.1`. Nginx in front terminates TLS and sets `X-Forwarded-For` (`AUTH_TRUST_PROXY_HEADERS=true`).
- **Database:** PostgreSQL 18.6 (17.11 fallback). The default is the same VPS, installed from the PostgreSQL project's packages; a managed service is the alternative (Q-25). Separate runtime and migration roles.
- **Media:** persistent local directory on the VPS (for example `/var/lib/rivana/media`) behind `MediaStorage`, outside the application release tree and exposed at a controlled `/media/` URL.
- **Email:** SMTP behind `ContactDelivery` for contact enquiries; auth reset delivery remains disabled until its provider flow is implemented.
- **DNS/TLS:** the production domain's DNS stays in the client's Cloudflare zone; Nginx serves TLS with a Let's Encrypt certificate, or a Cloudflare origin certificate when the record is proxied.

The app remains deployable as a standard Node process/container because domain/application code does not depend on any host's APIs. Host-specific process, cache, image, and filesystem integration stays in infrastructure/configuration.

The VPS provisioning checklist is in [hosting-preflight.md](./hosting-preflight.md). Do not commit hostnames, IP addresses, usernames, keys, or secrets.

## Environments

- **Local:** local PostgreSQL, temporary local-media root, captured/fake email; online booking on with demo branches and fictional guests.
- **Preview:** isolated database, separate media root, sandbox email, demo branches; no production personal data.
- **Client staging:** `staging.rivanaresidence.com`, a separate systemd service, Nginx site, database, database role, and media root on the VPS (or a second small VPS), protected from indexing. Its Cloudflare DNS record is deferred until the client regains access to the zone.
- **Production:** dedicated database credentials and persistent media root, verified email domain, configured canonical origin.

Never let preview deployments write to the production media root or database.

Docker can run on the VPS but is not used: one Node process under systemd is simpler to operate. Container images may still be used in CI or local development.

## Configuration

Expected server secrets/config include the WhatsApp provider access token (planned; the business number, phone-number id, and template names are entered by the Admin in the dashboard, Q-67), the Paymob API key, secret key, HMAC secret, and integration ids, and the public callback URL registered with Paymob (planned M9, Q-55), database runtime/migration URLs, auth secret/base URL, absolute `MEDIA_STORAGE_ROOT`, contact delivery mode and SMTP host/port/user/password/from/to addresses, canonical site URL, and optional observability DSN. Public environment variables are limited to genuinely public configuration. The database stores relative media keys, not `MEDIA_STORAGE_ROOT`. See `.env.example` and [phase-7-public-site.md](../delivery/reports/phase-7-public-site.md#contact-delivery-evidence) for the exact contact variables and pre-deployment smoke check.

All configuration is validated at startup. Missing critical production configuration fails the build/start clearly rather than silently disabling security.

## Build and migration flow

1. CI installs from the lockfile and runs quality gates.
2. Build uses pinned Node/dependency versions.
3. Production migration job runs `prisma migrate deploy` once using migration credentials/direct URL.
4. Upload a versioned release over SSH into `releases/<id>`, run `npm ci` and the build there, and switch the `current` symlink only after migration success.
5. Smoke checks verify public routes, admin login page, database health, media delivery, and contact delivery in a controlled mode.
6. Restart the systemd service and retain the previous releases for rollback. The shared media root is never copied over or removed by deployment cleanup.

Public content reads are cached on disk in `.next/cache/fetch-cache` and invalidated by CMS actions. After any out-of-band database change (backup restore, seed, SQL fix, CLI import), delete that directory and restart the app so visitors do not see stale content. See [phase-7-public-site.md](../delivery/reports/phase-7-public-site.md#public-cache).

Do not run development migrations or schema push in production. Destructive migrations use expand/migrate/contract steps across releases.

## Initial content

`npm run db:seed` (needs `DATABASE_URL`, `MEDIA_STORAGE_ROOT`, and `SEED_ADMIN_PASSWORD`) is the one seed. On a freshly migrated database it creates the structure (settings, the `new-cairo` branch, the three pages), the administrator `admin@rivanaresidence.com`, the branch's own contact details, address, coordinates, Google Maps embed link and check-in and check-out times, and the previous rivanaresidence.com content from `prisma/initial-content/`: the three rooms, Swimming Pool and Gym (Café as an unpublished draft until it has a photo), Home/About/Contact copy, social links, and 33 full-size photos with alt text, uploaded through the normal media pipeline. The map link in `prisma/initial-content/content.ts` was built from the owner's place link; replace it with the official Share > Embed a map link when convenient.

- Prices, availability, bookings, guests, and the old booking/refund policy pages are deliberately not imported.
- There is no default admin password, in any environment (audit F07). The seed refuses to run, before writing anything, unless `SEED_ADMIN_PASSWORD` is set and meets the staff password policy (12 or more characters, not common, and not containing the name or email, so nothing with `rivana` or `admin` in it). Re-runs need the variable too.
- `npm run db:seed -- --demo` adds fictional demo data for local review and must never run on a real site. It refuses when `NODE_ENV=production` or when `APP_URL` is set to a host other than localhost, so keep `APP_URL` set to the real https address in the server `.env`.
- On a server, pass it once from a protected shell or a temporary file that you delete afterwards. Do not type it on the command line (shell history keeps it) and do not leave it in the server `.env`. For local development, put it in your own `.env`.
- An administrator that an older seed created with `123456` is kept, because the seed never changes an existing account (it only logs "password unchanged"). Rotate it with `npm run staff -- set-password --email admin@rivanaresidence.com`, which also ends all of that account's sessions.
- Re-running is safe: an existing admin keeps its password, a branch that staff have edited is left alone, and content is added only while there are no rooms, facilities, or images. If a run is interrupted partway through the content step (the seed then warns about images without rooms), drop and re-create the database, run `npm run db:deploy`, and seed again.

## Backups and recovery

- nightly `scripts/backup.sh` copied off the server, plus point-in-time recovery (WAL archiving on the VPS, or the managed provider's);
- nightly off-server backup of the media root plus checksums/manifest; Hostinger VPS snapshots and backups are an extra layer, never the only copy;
- planned reservation jobs (cron, app user): `npm run reservations -- outbox` every minute or two (M8), `npm run reservations -- expire-holds` every minute and `npm run reservations -- reconcile-payments` every 5 minutes (M9), `npm run reservations -- expire-tokens` daily (M8) ([migrations-and-seeding.md](../database/migrations-and-seeding.md#scheduled-jobs-cron));
- hourly `npm run media -- cleanup` (cron) to fail abandoned uploads, clear stray quarantine files, and finish deletions whose file removal failed; see [phase-6-media.md](../delivery/reports/phase-6-media.md#storage-configuration-permissions-and-backup) for the media root layout and permissions;
- after any database restore, clear `.next/cache/fetch-cache` and restart the app;
- quarterly restore drill into a non-production environment;
- record recovery point/time objectives with the client before launch (initial target: RPO ≤ 24h, RTO ≤ 4h, improved if provider plans allow);
- content migration source assets retained separately until acceptance.

### Public throttle cleanup (M6-T9)

`npm run throttles -- cleanup-public` removes at most 1,000 expired availability limiter buckets per run. It preserves active windows, active locks, busy buckets, staff sign-in rows, and other public namespaces. Concurrent admission remains safe while cleanup runs. The script prints only `{"deleted":N}` on success, exits with status 2 for invalid arguments, and reports a generic failure with status 1. It disconnects from PostgreSQL before exit.

Schedule it hourly in the existing app user's cron before P5 is exposed. Run from the active `current` release with the same pinned Node 22.23 runtime and protected environment as other maintenance commands. The command loads that working directory's `.env` without overriding exported values. Do not copy secrets into the crontab. No new environment variables or secrets are needed. For example, after substituting the deployment paths and ensuring cron's `PATH` includes the pinned Node and npm:

```cron
0 * * * * cd /srv/rivana/current && npm run throttles -- cleanup-public >> /var/log/rivana/throttles.log 2>&1
```

The deployment paths above are examples, not provisioned paths. Check exit status and log output during deployment rehearsal. A result of 1,000 means more expired rows may remain; additional bounded runs are safe. Cleanup is storage maintenance, not part of request admission, so missed runs do not bypass the limit.

The prepared P5 policy uses one availability bucket per trusted client across branches, allowing 60 admissions per 60 second window. P5 endpoint wiring remains M6-T10. Without a trusted address, all such requests share one anonymous bucket. Enable `AUTH_TRUST_PROXY_HEADERS` only when the edge overwrites client supplied forwarding headers and the Next.js listener cannot be reached directly. Rehearse that trust configuration before public exposure. Staff sign-in policy remains separate.

### Backup and restore tooling

`scripts/backup.sh` and `scripts/restore.sh` (Phase 11) need `pg_dump`/`pg_restore`/`psql` at least as new as the server.

```bash
# Nightly (cron), then copy the new directory off the server:
DATABASE_URL=... MEDIA_STORAGE_ROOT=... scripts/backup.sh /path/to/backups

# Drill into a scratch database and media root (refuses non-empty targets):
RESTORE_DATABASE_URL=postgresql://.../rivana_restore_test \
RESTORE_MEDIA_ROOT=/absolute/scratch/media \
  scripts/restore.sh /path/to/backups/rivana-<timestamp>

# Real recovery (drops and recreates restored objects, swaps images/):
RESTORE_DATABASE_URL=... RESTORE_MEDIA_ROOT=... \
  scripts/restore.sh /path/to/backups/rivana-<timestamp> --replace
```

A backup holds a custom-format database dump (no owners or grants), `images/` as a tarball, a checksum for every image file, and `SHA256SUMS` over the set; directories are created mode 700. Restore verifies all checksums before touching anything, restores media through a staging directory, re-applies `750`/`640` permissions, and fails if any `READY` media record has no file. Prisma-only URL parameters are stripped (only `sslmode` is passed to libpq). The Phase 11 drill is recorded in [phase-11-release-candidate.md](../delivery/reports/phase-11-release-candidate.md#backup-and-restore-drill).

## Server operations

- install security updates automatically (unattended upgrades) and reboot in an announced window;
- firewall: the Hostinger firewall plus `ufw`, allowing only SSH, HTTP, and HTTPS; PostgreSQL listens on localhost only;
- SSH with keys only, no root login and no passwords; `fail2ban` on SSH;
- the app, PostgreSQL, and backups run as separate users; the media root is writable only by the app user;
- alerts on free disk space, memory, and the service being down;
- apply PostgreSQL minor updates promptly; major upgrades are planned changes with a backup first.

## Observability

- structured server logs with request/correlation IDs;
- auth failures, upload failures, contact delivery failures, database errors, and 5xx alerts;
- Web Vitals and uptime monitoring for critical public routes;
- never log secrets, session tokens, signed URLs, or full contact messages;
- error tracking is added only with privacy configuration and source-map controls.

## Domains, caching, and media

- canonical host redirects (www/non-www decision) and HTTPS enforcement;
- immutable media URLs/keys with long cache lifetime;
- web-server alias or media route prevents traversal, directory listing, dotfile access, executable interpretation, and MIME sniffing;
- CSP begins in report-only during preview, then is enforced;
- sitemap/robots/canonical origin verified after domain cutover.

## Release and rollback

- application rollback switches to the previous retained release and restarts the Node process;
- database changes must be backward-compatible during rollout because code rollback does not roll back data safely;
- media replacement is non-destructive until references move, enabling reversal; release rollback never deletes the shared media directory;
- feature/config switches keep future booking disabled until production verification.

## Launch checklist

- approved content, legal/privacy copy, image rights, and contact details;
- production admin accounts and revoked bootstrap credentials;
- backup and restore test;
- migrations and seed complete;
- security headers/CSP/TLS verified;
- accessibility, responsive, SEO, performance, and critical E2E gates pass;
- Search Console/analytics configured if approved;
- support ownership, incident contact, and content training documented;
- booking status clearly disabled until provider integration.
