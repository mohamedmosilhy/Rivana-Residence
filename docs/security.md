# Security

## Trust boundaries

Untrusted inputs include login credentials, all public/admin form data, URL params/slugs, rich-text documents, upload metadata and bytes, storage callbacks, environment variables, future booking provider output, and map/embed URLs. Client-side validation improves UX but is never authoritative.

## Authentication

- Better Auth 1.x with PostgreSQL-backed sessions and its Prisma adapter.
- Email/password enabled for provisioned admin accounts; public sign-up disabled.
- Better Auth's memory-hard password hashing is acceptable initially; use its supported default scrypt or a reviewed Argon2id customization, never custom home-grown crypto.
- Enforce minimum 12-character admin passwords, breached/common-password screening where practical, generic login errors, and login rate limits.
- Password reset tokens are single-use, short-lived, and delivered through the configured email service; successful reset revokes other sessions. Until an email provider is configured, self-service reset is disabled and administrators use the operator recovery procedure in [phase-3-auth.md](./phase-3-auth.md#operator-procedures), which also revokes every session.
- Cookies: `HttpOnly`, `Secure` in production, `SameSite=Lax` or stricter where compatible, host-only, minimal path/scope, rotated/revoked on sensitive changes.
- Seed/bootstrap admin credentials come from secure environment input and must be changed/rotated; never commit defaults.

Add TOTP/passkey support only after the core flow is stable or earlier if the client's risk profile requires it. The design leaves this as a Better Auth extension, not custom MFA.

## Authorization

- Roles: `EDITOR` and `ADMIN`.
- Proxy may perform an optimistic redirect, but every protected page query, Server Action, Route Handler, and application command performs a real session/role check.
- Authorization is centralized in a server-only data/application access layer and checked close to the data mutation.
- DTOs expose only fields required by the caller.
- Inactive/deleted users cannot create new sessions; administrators can revoke sessions.

## CSRF and request integrity

- Prefer same-origin Server Actions for CMS mutations and keep framework origin checks enabled.
- Better Auth owns CSRF/session protections for its endpoints.
- State-changing Route Handlers require authenticated sessions, expected methods, content types, origin checks, and request-size enforcement.
- Never mutate state on GET.
- Future provider webhooks require signature/timestamp verification and replay protection based on the provider contract.

## Validation and output safety

- Parse all external data with Zod, including `FormData`, route params, query strings, JSON, environment configuration, and section payloads.
- Normalize emails/slugs and enforce server/database length and numeric bounds.
- Rich text is a strict document tree rendered through known components; no raw editor HTML.
- React escaping remains enabled; avoid `dangerouslySetInnerHTML` except JSON-LD serialized with a safe serializer.
- External links validate protocols (`https`, and `tel`/`mailto` only in relevant fields) and add safe `rel` values when opening new contexts.
- Map and future embed domains are allowlisted.

## Upload security

1. Authenticated editor submits an upload with name, declared MIME, and size to the same-origin media route.
2. The server validates session/role, request size/count, extension, and supported MIME before streaming to a non-public quarantine directory; it never trusts a browser path or filename.
3. Finalization verifies bytes, magic bytes/decoded format, dimensions, checksum, and safe decoder result; declared headers alone are insufficient.
4. The server moves the approved file to an immutable, server-generated relative key below the configured media root and marks the asset `READY`.
5. Failed/quarantined files and abandoned pending records are deleted by cleanup.

Controls:

- canonicalize the configured root and verify every resolved target remains below it; reject traversal, separators, dot segments, symlinks, and user paths;
- random server-generated keys; never use an original filename as a filesystem path;
- JPEG/PNG/WebP/AVIF only after platform decoder support is confirmed;
- reject SVG and animated content in CMS uploads initially;
- configurable byte and megapixel limits (initial proposal: 15 MB and 40 MP before processing);
- strip risky metadata where the image pipeline supports it;
- prevent object overwrite; replacement uses a new key;
- the media root is not executable, directory listing is disabled, and only database-backed `READY` keys are publicly served;
- upload operations remain same-origin, authenticated, CSRF/origin checked, and tied to the session/user;
- Content-Type, `nosniff`, cache, range, and content-disposition headers are set intentionally.

## Promotion safety

- Promotion fields use strict length limits and plain text; no arbitrary HTML, script, URL, or style input.
- Codes use a conservative printable allowlist and are rendered as text.
- Active scheduling is evaluated server-side; client clocks never decide whether unpublished content is visible.
- Copy-to-clipboard is triggered only by a user action, reports success/failure accessibly, and has a selectable-text fallback.
- Dismissal state stores only promotion ID/version and expiry in the browser; it is not tracking or reservation data.

## Contact form

- Honeypot plus time-based heuristic initially; add a privacy-respecting challenge only if abuse warrants it.
- Rate limit by privacy-preserving, short-lived request key at the edge/server; do not store raw IP in enquiry records.
- Enforce message lengths and plain text; never interpolate visitor input into email headers.
- Delivery happens server-side and failures are recorded without exposing provider details.
- Display generic success so the form cannot enumerate internal recipients.

## Headers and browser policy

Implemented in Phase 11 (`src/infrastructure/http/security-headers.ts`):

- `src/proxy.ts` gives every rendered page a fresh 128-bit nonce and an enforced Content Security Policy: `default-src 'self'`; `script-src 'self' 'nonce-…' 'strict-dynamic'` (no `unsafe-inline` or `unsafe-eval` for scripts in production); `style-src 'self' 'unsafe-inline'` because server-rendered React and `next/image` emit `style=""` attributes; `img-src 'self' data: blob:`; `connect-src 'self'`; `frame-src https://www.google.com` for the optional Maps embed only; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`; and `upgrade-insecure-requests` when `APP_URL` is HTTPS. Next applies the nonce to its own scripts, so every page is rendered per request (the only previously static page, the root not-found page, now calls `connection()`).
- `next.config.ts` adds to every response, including static files: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`, and a `Permissions-Policy` that disables camera, microphone, geolocation, payment, USB, and topics.
- `/media/*` keeps its own `default-src 'none'; sandbox` policy, `nosniff`, and `Cross-Origin-Resource-Policy: same-origin`.
- Admin responses additionally carry `X-Robots-Tag: noindex, nofollow` and `Cache-Control: private, no-store`.
- HSTS is deliberately deferred to Phase 12: it is sent only once the canonical HTTPS domain is live, starting with a short `max-age` before a long one.

Under `'strict-dynamic'`, a script created by already-trusted page code is allowed; injected markup (inline handlers, `javascript:` URLs, parser-inserted scripts) is refused. `tests/e2e/security.spec.ts` proves both the refusal and that every page hydrates with zero violations.

The future booking integration gets explicit `script-src`, `frame-src`, `connect-src`, and consent review; it is not covered by broad wildcards.

## Secrets and configuration

- Validate server environment at startup with a server-only Zod schema.
- Store database URLs, auth secret, storage credentials, email keys, and future provider secrets in deployment secret management.
- Never prefix secrets with `NEXT_PUBLIC_`; only publish explicitly safe config.
- Maintain separate media roots/containers, credentials, and databases per environment.
- Rotate secrets and revoke old credentials after incidents or staff changes.

## Database and operations

- Application database role has only required schema privileges; migration credentials are separate when the platform supports it. Recommended provisioning (Phase 12), where `rivana_owner` owns the schema and runs `prisma migrate deploy`, and `rivana_app` is the runtime role:

  ```sql
  REVOKE ALL ON SCHEMA public FROM PUBLIC;
  GRANT USAGE ON SCHEMA public TO rivana_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rivana_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rivana_app;
  ALTER DEFAULT PRIVILEGES FOR ROLE rivana_owner IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rivana_app;
  REVOKE INSERT, UPDATE, DELETE ON "_prisma_migrations" FROM rivana_app;
  ```

  The runtime role cannot create, alter, or drop objects or rewrite migration history.
- Encrypted database connections where supported; local media permissions restrict access to the application account and backup operator.
- Parameterized Prisma queries; raw SQL only reviewed and parameterized.
- Backups, restore drills, migration review, dependency/security updates, and audit logs for auth failures/infrastructure errors.
- Do not log passwords, session tokens, upload signatures, full contact messages, or sensitive provider payloads.

## Privacy and retention

- Publish a privacy notice before collecting enquiries/analytics.
- Keep contact enquiries only as long as operationally required (initial proposal: archive/purge after 12 months, subject to client/legal confirmation).
- Use minimal analytics and consent where jurisdiction/provider requires it.
- Media credits and consent for identifiable people must be confirmed during content migration.

## Security release gate

- threat-model admin auth, uploads/local path handling, promotions, contact form, and booking boundary;
- dependency audit and supported versions;
- authorization tests for every command;
- CSP enforced and verified with zero violations across public and admin pages (Phase 11);
- backup restore tested;
- no default credentials or secrets in repository/build output;
- penetration-style checks for IDOR, upload bypass, stored XSS, CSRF, brute force, and open redirects.
