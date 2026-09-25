# Deployment

## Initial topology

- **Application:** Next.js 16 production Node process on Hosting.com/cPanel, deployed over the existing SSH access after account preflight.
- **Database:** PostgreSQL 18.6 where supported (17.11 fallback), either on the Hosting.com account or an external managed service, with backups and separate runtime/migration credentials where available.
- **Media:** persistent local directory on the Hosting.com account behind `MediaStorage`, outside the application checkout/release tree and exposed at a controlled `/media/` URL.
- **Email:** SMTP behind `ContactDelivery` for contact enquiries; auth reset delivery remains disabled until its provider flow is implemented.
- **DNS/TLS:** production domain with managed TLS.

The app remains deployable as a standard Node process/container because domain/application code does not depend on cPanel APIs. Host-specific process, cache, image, and filesystem integration stays in infrastructure/configuration.

The initial read-only SSH preflight is recorded in [hosting-preflight.md](./hosting-preflight.md). Node 22/Passenger, rsync, cron, and account capacity are available. The login shell still defaults to Node 10, so deployment must explicitly use the CloudLinux Node 22 application environment. The local PostgreSQL tooling is version 10 and no account database is allocated; use an external supported PostgreSQL 17+ service unless Hosting.com provisions a supported major. Do not commit hostnames, usernames, keys, or absolute account paths.

## Environments

- **Local:** local PostgreSQL, temporary local-media root, captured/fake email, disabled booking.
- **Preview:** isolated database, separate media root, sandbox email, disabled booking; no production personal data.
- **Client staging:** `staging.rivanaresidence.com`, deployed as a separate Node 22/Passenger application and protected from indexing. It must use staging-only database credentials and media root. Its Cloudflare DNS record is deferred until deployment/account access is available.
- **Production:** dedicated database credentials and persistent media root, verified email domain, configured canonical origin.

Never let preview deployments write to the production media root or database.

Docker is not available on the current shared cPanel plan. Build/test container images may still be used in CI or local development, but cPanel deployment uses the standard Next.js Node server under CloudLinux/Passenger. This preserves the same application artifact without requiring a container runtime on the host.

## Configuration

Expected server secrets/config include database runtime/migration URLs, auth secret/base URL, absolute `MEDIA_STORAGE_ROOT`, contact delivery mode and SMTP host/port/user/password/from/to addresses, canonical site URL, and optional observability DSN. Public environment variables are limited to genuinely public configuration. The database stores relative media keys, not `MEDIA_STORAGE_ROOT`. See `.env.example` and [phase-7-public-site.md](./phase-7-public-site.md#contact-delivery-evidence) for the exact contact variables and pre-deployment smoke check.

All configuration is validated at startup. Missing critical production configuration fails the build/start clearly rather than silently disabling security.

## Build and migration flow

1. CI installs from the lockfile and runs quality gates.
2. Build uses pinned Node/dependency versions.
3. Production migration job runs `prisma migrate deploy` once using migration credentials/direct URL.
4. Upload a versioned release over SSH, build/install as supported by the account, and switch the active release only after migration success.
5. Smoke checks verify public routes, admin login page, database health, media delivery, and contact delivery in a controlled mode.
6. Restart/reload the managed Node process and retain the previous release for rollback. The shared media root is never copied over or removed by deployment cleanup.

Public content reads are cached on disk in `.next/cache/fetch-cache` and invalidated by CMS actions. After any out-of-band database change (backup restore, seed, SQL fix, CLI import), delete that directory and restart the app so visitors do not see stale content. See [phase-7-public-site.md](./phase-7-public-site.md#public-cache).

Do not run development migrations or schema push in production. Destructive migrations use expand/migrate/contract steps across releases.

## Backups and recovery

- managed PostgreSQL daily backups plus point-in-time recovery where available;
- nightly off-server backup of the media root plus checksums/manifest; cPanel account backups alone are not the only copy;
- hourly `npm run media -- cleanup` (cron) to fail abandoned uploads, clear stray quarantine files, and finish deletions whose file removal failed; see [phase-6-media.md](./phase-6-media.md#storage-configuration-permissions-and-backup) for the media root layout and permissions;
- after any database restore, clear `.next/cache/fetch-cache` and restart the app;
- quarterly restore drill into a non-production environment;
- record recovery point/time objectives with the client before launch (initial target: RPO ≤ 24h, RTO ≤ 4h, improved if provider plans allow);
- content migration source assets retained separately until acceptance.

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
