# Phase 3 authentication and authorization handoff

Status: **Accepted on 2026-09-25**  
Completed: 2026-09-25  
Scope: closed staff authentication, sessions, roles, and the protected admin boundary. No content-mutation UI.

## Outcome

Admin access now requires a provisioned staff account. Sign-in uses Better Auth email/password with sessions stored in PostgreSQL. There is no sign-up path. Every protected page and Server Action re-checks the database session, the user's active flag, and the role's capability on the server. The proxy only redirects early when no session cookie is present.

## Decisions for the client to confirm

| Decision | Choice made | Why |
| --- | --- | --- |
| Password reset | **Self-service reset is deferred**; an administrator resets passwords with `npm run staff -- set-password`, which also ends every session for that user | No transactional email provider is configured yet. The roadmap allows deferral when a manual recovery procedure is documented; see [Operator procedures](#operator-procedures). |
| Session lifetime | 12 hours, extended at most hourly while the user works in the admin | Short enough for a shared hotel front desk; long enough for a working day |
| Editor vs administrator | See the [capability matrix](#role-capability-matrix) | Follows `admin-dashboard.md`: only administrators delete media, change settings, or manage staff |
| Better Auth HTTP endpoints | **Not mounted** (`/api/auth/*` does not exist) | All auth goes through same-origin Server Actions. This removes the library's unused endpoints (sign-up, OAuth, email change, and so on) from the attack surface and leaves one rate limiter to reason about. |
| Staff user management UI | A read-only staff list for administrators; changes go through the operator CLI | A full user editor belongs with the admin shell workflows in Phase 4 |

## Auth configuration summary (secrets redacted)

| Setting | Value |
| --- | --- |
| Library | `better-auth` **1.7.6**, pinned exact (latest security patch of the 1.7 line named in ADR 004) |
| Adapter | `better-auth/adapters/prisma`, `provider: "postgresql"`, transactions on |
| Methods | Email and password only. `disableSignUp: true`, `autoSignIn: false`. Email change, account deletion, and account linking are disabled. |
| Password hashing | Better Auth default scrypt; nothing custom |
| Password policy | 12 to 128 characters, no single repeated character, a local common-password screen, and no name or email local part. Enforced at provisioning and on password change. |
| Sessions | Database sessions, `expiresIn` 12 h, `updateAge` 1 h, `freshAge` 15 min, **cookie cache off** so revocation is immediate |
| Cookie | `rivana.session_token`, or `__Secure-rivana.session_token` in production; `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/admin`, host-only (no `Domain`) |
| Trusted origins | Only the origin of `APP_URL` |
| Secret | `BETTER_AUTH_SECRET`: required in production, at least 32 characters, never `NEXT_PUBLIC_` |
| IP tracking | Disabled (`advanced.ipAddress.disableIpTracking`); sessions store no IP address |
| IDs | CUID2, the same as all other tables |
| Telemetry | Disabled |
| Inactive users | A `session.create` hook refuses sessions for inactive users. It runs after the password check, so timing and response match a wrong password. |

Environment added: `BETTER_AUTH_SECRET` and `AUTH_TRUST_PROXY_HEADERS` (default `false`; set `true` only behind the Hosting.com proxy so per-client throttling can read `X-Forwarded-For`). Server environment parsing is now lazy, so `next build` needs no production secrets.

## Architecture

```text
src/proxy.ts                         optimistic redirect + noindex/no-store headers for /admin
src/app/admin/login/                 page + signInAction (Server Action)
src/app/admin/(protected)/           layout + pages; every page calls requireStaff(path, capability)
src/composition/auth.ts              the only module src/app uses for auth (lint-enforced)
src/application/auth/                SignIn use case, authorize(), safeReturnPath(), ports
src/domain/auth/                     capability matrix, password policy, throttle policy
src/infrastructure/auth/             Better Auth factory, authenticator, session resolver, HMAC keys
src/infrastructure/db/prisma/repositories/{staff-directory,login-throttle-store}.ts
scripts/staff.mts (+ staff-admin.ts) operator CLI
```

Request flow:

1. The proxy redirects `/admin/*` to `/admin/login?returnTo=…` when no session cookie is present. It never authorizes anything.
2. Each page calls `requireStaff(path, capability)`, which runs `auth.api.getSession` against the database and then re-reads the user row. An inactive user has every session deleted and is treated as signed out. A signed-out user is redirected to login; a signed-in user without the capability sees an access-denied state with no data.
3. Each Server Action calls `authorizeAction(capability)` and gets back `UNAUTHENTICATED` or `FORBIDDEN` before touching data.
4. `returnTo` accepts only same-origin `/admin` paths that aren't the login page. Everything else falls back to `/admin`.

## Role capability matrix

Source: `src/domain/auth/capabilities.ts`. Every cell is asserted in `tests/unit/auth/authorization.test.ts`.

| Capability | Editor | Administrator |
| --- | :-: | :-: |
| `admin:access` | ✓ | ✓ |
| `content:edit`, `content:publish`, `content:archive` | ✓ | ✓ |
| `media:upload` | ✓ | ✓ |
| `media:delete` | – | ✓ |
| `promotions:manage` | ✓ | ✓ |
| `enquiries:read`, `enquiries:manage` | ✓ | ✓ |
| `settings:edit` | – | ✓ |
| `users:manage` (the `/admin/staff` page) | – | ✓ |
| `sessions:manage-own` (the `/admin/account` page) | ✓ | ✓ |
| `sessions:revoke-any` | – | ✓ |

## Brute-force protection

The `SignIn` use case checks two counters before calling Better Auth:

- **Per account:** 5 failures in 15 minutes locks that email for 15 minutes. Unknown emails get a counter too, so a lockout reveals nothing about which accounts exist.
- **Per client:** 20 failures in 15 minutes from one address. This is active only with `AUTH_TRUST_PROXY_HEADERS=true`.

Counters live in `LoginThrottle` and are keyed by an HMAC-SHA256 of the email or address using the auth secret, so no raw email or IP is stored. Each failure is applied atomically (`INSERT … ON CONFLICT` then `SELECT … FOR UPDATE`); a concurrency test checks that 12 parallel failures count as exactly 12. A successful sign-in clears the account counter. The screen shows only two messages: one for invalid credentials and one for being rate limited.

## Database changes

Migration `20260925141030_auth`: `Session`, `Account`, and `Verification` are Better Auth 1.7 core tables. `Session.token` is unique, with indexes on `userId` and `expiresAt`; `Account` is unique on `(providerId, accountId)`; both cascade when their user is deleted. `LoginThrottle` was added, along with two checks: `User_email_normalized_check` (email must be stored lower-case and trimmed) and `LoginThrottle_failures_check`. `prisma migrate diff` reports no drift. The Phase 2 seed no longer creates a credential-less admin; staff come only from the CLI.

## Operator procedures

All commands read `DATABASE_URL` (or `DIRECT_DATABASE_URL`). Passwords are never accepted as arguments: they are prompted for without echo, or piped with `--password-stdin`.

```bash
npm run staff -- create --email owner@rivana.example --name "Owner Name" --role ADMIN   # first administrator
npm run staff -- create --email frontdesk@rivana.example --name "Front Desk" --role EDITOR
npm run staff -- set-password --email frontdesk@rivana.example   # manual recovery; ends all their sessions
npm run staff -- deactivate --email frontdesk@rivana.example     # blocks sign-in; ends all their sessions
npm run staff -- activate --email frontdesk@rivana.example
npm run staff -- set-role --email frontdesk@rivana.example --role ADMIN
npm run staff -- revoke-sessions --email frontdesk@rivana.example
npm run staff -- list
```

The CLI refuses to deactivate or demote the last active administrator. **Manual password recovery:** the requester confirms their identity out of band (in person or by a known phone number). An administrator then runs `set-password` from the server shell and gives the requester the temporary password through a separate channel. The requester changes it at `/admin/account`. Rotating `BETTER_AUTH_SECRET` signs out every user.

## Verification

| Check | Result |
| --- | --- |
| `npm run check` (format, lint, typecheck, unit, build) | Pass. The build needs no secrets; admin routes are dynamic. |
| Unit and architecture tests | 13 files, 152 tests pass |
| Integration tests (PostgreSQL 18.4) | 7 files, 80 tests pass (27 new for auth and throttling) |
| E2E tests (Playwright, desktop and mobile Chromium, production build) | 23 passed. One was skipped by design: the keyboard flow runs on desktop only. |
| Client bundle scan (`.next/static`) | No auth secret, `DATABASE_URL`, `session_token`, adapter, or hashing code |
| Server log review during E2E | No emails, passwords, tokens, or secrets |

Evidence mapped to the roadmap:

- **Authorization matrix and safe return URLs:** `tests/unit/auth/authorization.test.ts` and `return-path.test.ts`. The latter covers 22 hostile inputs, including `//host`, backslashes, encoded separators, `javascript:`, control characters, `/administrator`, and the login page itself.
- **Session creation, expiry, revocation, inactive users, role changes:** `tests/integration/auth.test.ts`.
- **User enumeration:** unknown emails and wrong passwords produce the same API error, and the use case returns the same generic result for both (integration and E2E). Unknown-email lockout behaves the same as a real account.
- **Brute force:** `tests/integration/login-throttle.test.ts`, plus an E2E lockout after 5 failures.
- **Session invalidation:** sign-out, replaying a stolen cookie after sign-out (E2E), password change revoking other sessions, and operator reset and deactivation ending all sessions.
- **Direct protected-action denial:** an E2E test revokes the session in the database, then submits a stale account form. The Server Action refuses it and redirects to login.
- **No sign-up:** `signUpEmail` is rejected, there is no `/api/auth` route, and the login page has no registration link. `role` and `active` are input-locked in the auth API.
- **Accessibility:** axe reports no violations on login, the login error state, and the signed-in admin. The error is announced (`role="alert"`) and focused, fields carry `aria-invalid`, labels are explicit, and the keyboard order is email → password → submit.

Cookie and header inspection, from a production build on `http://127.0.0.1` after sign-in:

```json
{"name":"__Secure-rivana.session_token","value":"<redacted>","domain":"127.0.0.1","path":"/admin","httpOnly":true,"secure":true,"sameSite":"Lax"}
```

`/admin` responses: `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow`. Public pages never receive the cookie because it is scoped to `/admin`; E2E asserts this.

Screenshots in `docs/screenshots/`:

- `phase-3-login-desktop.png` and `phase-3-login-mobile.png`
- `phase-3-login-error-desktop.png`
- `phase-3-overview-admin-desktop.png`
- `phase-3-account-desktop.png`
- `phase-3-staff-admin-desktop.png`
- `phase-3-staff-denied-editor-mobile.png`

## Known limitations and follow-ups

- **Self-service password reset** waits for a transactional email provider. When one exists, enable Better Auth `sendResetPassword` with `revokeSessionsOnPasswordReset` (already set) and add the reset link to the login page.
- **Per-client throttling** depends on `AUTH_TRUST_PROXY_HEADERS=true`, which needs confirming on the Hosting.com Passenger setup at deployment. The per-account limit works regardless.
- **Sliding session refresh** happens only when a Server Action runs. Server Components cannot write cookies, so a user who only browses is signed out after 12 hours.
- **MFA (TOTP or passkeys)** is not enabled. It remains a Better Auth plugin extension, as ADR 004 describes.
- **Staff management** is read-only in the UI; creating, deactivating, and changing roles use the CLI. Phase 4 kept this; no roadmap phase currently schedules a user editor.

## Reviewer decision

Approved by the client on 2026-09-25, including the password-reset deferral and the 12-hour session lifetime above. Phase 4 was authorized to begin.
