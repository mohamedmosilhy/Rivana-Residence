# Deployment

## Initial topology

Planned in [ADR 023](../adr/023-hostinger-vps-deployment.md); not yet provisioned.

- **Server:** a Hostinger KVM VPS used only for Rivana, running a current Ubuntu LTS release, in the data centre closest to Egypt.
- **Application:** Next.js 16 production server (`next start`) on Node 26.13.0 LTS, one process run by a systemd service as a dedicated unprivileged user, listening on `127.0.0.1`. Nginx in front terminates TLS and sets `X-Forwarded-For` (`AUTH_TRUST_PROXY_HEADERS=true`).
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

Server configuration includes database runtime and migration URLs, the auth secret and base URL, an absolute `MEDIA_STORAGE_ROOT`, contact delivery mode and SMTP settings, the canonical site URL, and an optional observability DSN. Public variables carry public configuration only. The database stores media keys relative to the storage root. See `.env.example` for the exact settings and the [contact delivery smoke check](../delivery/reports/phase-7-public-site.md#contact-delivery-evidence).

Production reservation email defaults to `EMAIL_PROVIDER=smtp`. WhatsApp defaults to `WHATSAPP_PROVIDER=meta` and requires `WHATSAPP_ACCESS_TOKEN` to send. `WHATSAPP_GRAPH_VERSION` defaults to `v23.0`. The Admin manages the business number, phone-number id, and templates in the dashboard (Q-67). `PAYMENT_PROVIDER` selects the checkout adapter. Online payment requires a ready gateway and each branch's Admin switch, which starts off. Configure gateway secrets and register the callback URL when the real gateway is installed in M15-T4a. Production rejects `fake` for all three kinds. [Provider settings](../architecture/provider-adapters.md#environment-variables)

**Cancellation request delivery (M9-T7).** Set each branch's contact email for its staff alerts. If the inbox is missing, the outbox records a failed staff alert and the request stays saved. For WhatsApp purpose `CANCELLATION_RECEIVED`, use an approved provider template with variables drawn from `guestFirstName`, `reference`, and `branchName`. An older template that requires `manageLink` appears as a setup gap. Replace the template name and variable mapping together. This setup gap does not stop online booking.

**Decisions and refunds (M9-T8).** WhatsApp purposes `CANCELLATION_APPROVED` (variables from `guestFirstName`, `reference`, `branchName`, and optionally `refundAmount`), `CANCELLATION_REJECTED` (with `reason`) and `REFUND_COMPLETED` (with `refundAmount`) carry no manage link. Do not make `refundAmount` required in the `CANCELLATION_APPROVED` template: an unpaid approval sends none. The branch inbox receives three new staff emails: a refused refund, a refund paid after the guest already arrived, and a possible double payment. No new cron job: the existing `reconcile-payments` run (every 5 minutes) also looks up refunds sent more than 10 minutes ago.

**Paid change requests (M9-T11).** Configure the branch contact email for staff request alerts. Use approved templates for `CHANGE_REQUEST_RECEIVED`, `CHANGE_REQUEST_APPROVED`, and `CHANGE_REQUEST_REJECTED`. The receipt provides `guestFirstName`, `reference`, and `branchName`. The approval also provides `checkIn`, `checkOut`, and `total`. The rejection adds `reason`. Keep `manageLink` out of these templates. During a release switch or rollback, the paid staff cancellation reader and writer still support the previous notification format. The migration also recovers the staff cancellation reason from the approval audit.

**Phone verification (implemented M8-T5):** set `PHONE_VERIFICATION_SECRET` to an independently generated secret of at least 32 characters. Generate it with `openssl rand -hex 32`, then configure it only in the local environment or deployment secret store; never commit the value. Blank or absent disables verification with `503 VERIFICATION_UNAVAILABLE` once WhatsApp is configured, while a short nonempty value is invalid configuration. It is separate from `BETTER_AUTH_SECRET` and the WhatsApp access token. Rotating it invalidates outstanding codes; already-issued tokens keep their normal expiry because their SHA-256 hashes do not depend on this key. Restart the app after changing configuration. P9 also requires the existing WhatsApp readiness checks; without setup it returns `503 WHATSAPP_NOT_CONFIGURED` and creates no verification.


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

## Runtime alignment

The owner selected Node **26.13.0 LTS** on 2026-11-10 for local development, CI, and hosting. `.nvmrc` and `.node-version` pin that release; `package.json` allows Node 26 from 26.13.0 onward and keeps the existing npm 11 requirement. CI reads `.nvmrc`. When changing the runtime pin, update both version files, the package engine and lockfile, Node typings, and the hosting checklist together.

Check `node --version` and `npm --version` from the project directory before installing or running gates. With nvm, `nvm install` followed by `nvm use` selects the committed version. On this Mac, Homebrew's `node` formula supplies 26.13.0 through `/opt/homebrew/bin`; the previous `node@24` remains installed for rollback. Existing terminals or IDE processes may need a new shell to pick up the linked executable.

Use the same pinned release for the systemd service and cron, rather than relying on the host's default Node. The [Node 26.13.0 release notes](https://nodejs.org/en/blog/release/v26.13.0) document the Linux `libatomic` dependency; verify that library is available on the Ubuntu host before launch. Historical task reports retain the runtime each task actually used.

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
- Run the reservation cron jobs as the app user with `NODE_ENV=production`. Run `npm run reservations -- outbox` every minute and `npm run reservations -- expire-tokens` daily. M9 adds `expire-holds` every minute and `reconcile-payments` every 5 minutes. [Scheduled jobs](../database/migrations-and-seeding.md#scheduled-jobs-cron)
- hourly `npm run media -- cleanup` (cron) to fail abandoned uploads, clear stray quarantine files, and finish deletions whose file removal failed; see [phase-6-media.md](../delivery/reports/phase-6-media.md#storage-configuration-permissions-and-backup) for the media root layout and permissions;
- after any database restore, clear `.next/cache/fetch-cache` and restart the app;
- quarterly restore drill into a non-production environment;
- record recovery point/time objectives with the client before launch (initial target: RPO ≤ 24h, RTO ≤ 4h, improved if provider plans allow);
- content migration source assets retained separately until acceptance.

### Public throttle cleanup (M6-T9)

`npm run throttles -- cleanup-public` removes at most 1,000 expired limiter buckets per namespace listed in [`PUBLIC_RATE_LIMITS`](../../src/application/shared/public-rate-limit-policy.ts), including `guest-request`, `guest-change-preview`, and `guest-change`. It preserves active windows, active locks, busy buckets, staff sign-in rows, and public namespaces outside that list. Concurrent admission remains safe while cleanup runs. The script prints only `{"deleted":N}` on success, exits with status 2 for invalid arguments, and reports a generic failure with status 1. It disconnects from PostgreSQL before exit. Without trusted proxy headers every client shares one anonymous bucket per namespace. Set the trusted proxy configuration in production so one client cannot exhaust the shared limit for everyone (see the rehearsal below).

Schedule it hourly in the existing app user's cron before P5 is exposed. Run from the active `current` release with the same pinned Node 26.13.0 LTS runtime and protected environment as other maintenance commands. The command loads that working directory's `.env` without overriding exported values. Do not copy secrets into the crontab. No new environment variables or secrets are needed. For example, after substituting the deployment paths and ensuring cron's `PATH` includes the pinned Node and npm:

```cron
0 * * * * cd /srv/rivana/current && npm run throttles -- cleanup-public >> /var/log/rivana/throttles.log 2>&1
```

The deployment paths above are examples, not provisioned paths. Check exit status and log output during deployment rehearsal. A result of 1,000 means more expired rows may remain; additional bounded runs are safe. Cleanup is storage maintenance, not part of request admission, so missed runs do not bypass the limit.

P5 uses one availability bucket per trusted client across branches, allowing 60 admissions per 60 second window. P5 endpoint wiring is implemented in M6-T10. Without a trusted address, all such requests share one anonymous bucket. Enable `AUTH_TRUST_PROXY_HEADERS` only when the edge overwrites client supplied forwarding headers and the Next.js listener cannot be reached directly. Rehearse that trust configuration before public exposure. Staff sign-in policy remains separate.

P7 (`POST /api/v1/reservations`, M8-T7b) uses the `booking-create` bucket: 5 admissions per trusted client per hour, on top of the per phone caps. Every request counts, including a replay, a missing key and a price change, because admission runs before the body is read (owner decision, 2026-11-20, to revisit with the payment gateway in M9). A guest whose response was lost can therefore see `429` with `Retry-After` for up to an hour even though the booking exists; the hotel can confirm it by phone or from the staff screens. The bucket is far more sensitive to proxy configuration than P5: with trust off, or behind a proxy that hides visitor addresses, the whole site shares five bookings an hour. The hourly cleanup prunes this bucket with the others.

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
