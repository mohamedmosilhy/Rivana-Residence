# Security

## Trust boundaries

Untrusted inputs include login credentials, all public/admin form data, URL params/slugs, rich-text documents, upload metadata and bytes, storage callbacks, environment variables, future booking provider output, and map/embed URLs. Client-side validation improves UX but is never authoritative.

## Authentication

- Better Auth 1.x with PostgreSQL-backed sessions and its Prisma adapter.
- Email/password enabled for provisioned admin accounts; public sign-up disabled.
- Better Auth's memory-hard password hashing is acceptable initially; use its supported default scrypt or a reviewed Argon2id customization, never custom home-grown crypto.
- Enforce minimum 12-character admin passwords, breached/common-password screening where practical, generic login errors, and login rate limits.
- Password reset tokens are single-use, short-lived, and delivered through the configured email service; successful reset revokes other sessions.
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
- State-changing Route Handlers require authenticated sessions, expected methods, content types, origin checks, and unguessable signed upload tokens where applicable.
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

1. Authenticated editor requests an upload intent with name, declared MIME, and size.
2. Server validates role, count, extension, size, and supported MIME, then issues a short-lived signed key scoped to one object.
3. Object uploads directly to private/quarantined storage.
4. Finalization verifies object size, magic bytes/decoded format, dimensions, checksum, and safe decoder result; declared headers alone are insufficient.
5. Approved object becomes `READY`; failed/quarantined objects are deleted by cleanup.

Controls:

- random server-generated keys; never use user paths;
- JPEG/PNG/WebP/AVIF only after platform decoder support is confirmed;
- reject SVG and animated content in CMS uploads initially;
- configurable byte and megapixel limits (initial proposal: 15 MB and 40 MP before processing);
- strip risky metadata where the image pipeline supports it;
- prevent object overwrite; replacement uses a new key;
- signed operations expire quickly and are tied to the session/user;
- Content-Type, `nosniff`, cache, and content-disposition headers set intentionally.

## Contact form

- Honeypot plus time-based heuristic initially; add a privacy-respecting challenge only if abuse warrants it.
- Rate limit by privacy-preserving, short-lived request key at the edge/server; do not store raw IP in enquiry records.
- Enforce message lengths and plain text; never interpolate visitor input into email headers.
- Delivery happens server-side and failures are recorded without exposing provider details.
- Display generic success so the form cannot enumerate internal recipients.

## Headers and browser policy

Production headers include:

- Content Security Policy built from the minimum required origins;
- `frame-ancestors 'none'` unless a documented hosting need changes it;
- `X-Content-Type-Options: nosniff`;
- strict referrer policy;
- permissions policy disabling unused camera/microphone/geolocation features;
- HSTS after HTTPS/domain readiness;
- clickjacking protections through CSP.

The future booking integration gets explicit `script-src`, `frame-src`, `connect-src`, and consent review; it is not covered by broad wildcards.

## Secrets and configuration

- Validate server environment at startup with a server-only Zod schema.
- Store database URLs, auth secret, storage credentials, email keys, and future provider secrets in deployment secret management.
- Never prefix secrets with `NEXT_PUBLIC_`; only publish explicitly safe config.
- Maintain separate credentials and buckets/databases per environment.
- Rotate secrets and revoke old credentials after incidents or staff changes.

## Database and operations

- Application database role has only required schema privileges; migration credentials are separate when the platform supports it.
- Encrypted connections to managed PostgreSQL and object storage.
- Parameterized Prisma queries; raw SQL only reviewed and parameterized.
- Backups, restore drills, migration review, dependency/security updates, and audit logs for auth failures/infrastructure errors.
- Do not log passwords, session tokens, upload signatures, full contact messages, or sensitive provider payloads.

## Privacy and retention

- Publish a privacy notice before collecting enquiries/analytics.
- Keep contact enquiries only as long as operationally required (initial proposal: archive/purge after 12 months, subject to client/legal confirmation).
- Use minimal analytics and consent where jurisdiction/provider requires it.
- Media credits and consent for identifiable people must be confirmed during content migration.

## Security release gate

- threat-model admin auth, uploads, contact form, and booking boundary;
- dependency audit and supported versions;
- authorization tests for every command;
- CSP tested in report-only then enforced;
- backup restore tested;
- no default credentials or secrets in repository/build output;
- penetration-style checks for IDOR, upload bypass, stored XSS, CSRF, brute force, and open redirects.
