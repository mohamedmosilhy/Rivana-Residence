# ADR 004 — Better Auth for closed admin access

Status: Accepted for Phase 1

## Context

The CMS needs secure email/password login, sessions, password reset, roles, and revocation for a small known staff group. Custom auth is security-sensitive; Auth.js currently directs new development toward Better Auth and leaves more credential lifecycle logic to the application.

## Decision

Use Better Auth 1.7.3 (or the latest security-patched compatible 1.7.x at Phase 1 lock) with its Prisma adapter, PostgreSQL database sessions, email/password for provisioned users, disabled public sign-up, and `EDITOR`/`ADMIN` authorization enforced in application/DAL code.

## Reasoning

Better Auth supplies maintained credential/session/reset primitives, supported Next.js integration, a Prisma adapter, and an extension path for passkeys/2FA. Database sessions enable revocation and staff deactivation.

## Alternatives considered

- **Custom encrypted cookies/password tables:** smaller dependency, substantially higher security/maintenance risk.
- **Auth.js credentials:** viable, but credential persistence/reset/rate-limit behavior remains more bespoke and its own docs point toward Better Auth.
- **Managed identity provider:** strong security, but added recurring cost/tenant complexity for a tiny closed admin audience.
- **Magic link only:** removes passwords but makes admin access depend completely on email delivery.

## Consequences

Auth-owned schema is accepted and versioned with the pinned library. The app still performs authorization at every sensitive boundary. Email delivery is needed for password reset. MFA can be added without redesign, but is not silently enabled without operational setup.
