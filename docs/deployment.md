# Deployment

## Initial topology

- **Application:** Vercel-hosted Next.js 16 application.
- **Database:** managed PostgreSQL 18.6 where supported (17.11 fallback) with automated backups, pooled runtime URL, and direct migration URL.
- **Media:** S3-compatible object storage/CDN (initial provider selected during Phase 1 procurement; Cloudflare R2 or equivalent is suitable) behind `MediaStorage`.
- **Email:** transactional provider behind `ContactDelivery` and auth reset callbacks.
- **DNS/TLS:** production domain with managed TLS.

The app remains deployable as a Node container because domain/application code does not depend on Vercel APIs. Provider-specific cache/image/storage integration stays in infrastructure/configuration.

## Environments

- **Local:** local PostgreSQL, filesystem or local S3-compatible media adapter, captured/fake email, disabled booking.
- **Preview:** isolated or branched database, separate object prefix/bucket, sandbox email, disabled booking; no production personal data.
- **Production:** dedicated database/bucket/credentials, verified email domain, configured canonical origin.

Never let preview deployments write to production storage or database.

## Configuration

Expected server secrets/config include database pooled/direct URLs, auth secret/base URL, storage endpoint/region/bucket/access credentials, email API key/from/to addresses, canonical site URL, and optional observability DSN. Public environment variables are limited to genuinely public configuration.

All configuration is validated at startup. Missing critical production configuration fails the build/start clearly rather than silently disabling security.

## Build and migration flow

1. CI installs from the lockfile and runs quality gates.
2. Build uses pinned Node/dependency versions.
3. Production migration job runs `prisma migrate deploy` once using migration credentials/direct URL.
4. Application deploy proceeds after migration success.
5. Smoke checks verify public routes, admin login page, database health, media delivery, and contact delivery in a controlled mode.
6. Release is promoted/traffic-shifted according to platform capabilities.

Do not run development migrations or schema push in production. Destructive migrations use expand/migrate/contract steps across releases.

## Backups and recovery

- managed PostgreSQL daily backups plus point-in-time recovery where available;
- object versioning or recovery policy appropriate to the storage provider;
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
- CDN/image allowlist contains only controlled media origins;
- CSP begins in report-only during preview, then is enforced;
- sitemap/robots/canonical origin verified after domain cutover.

## Release and rollback

- application rollback uses the previous immutable deployment;
- database changes must be backward-compatible during rollout because code rollback does not roll back data safely;
- media replacement is non-destructive until references move, enabling reversal;
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
