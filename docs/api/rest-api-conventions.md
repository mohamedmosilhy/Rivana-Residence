# REST API conventions

Status: **Implemented in M4** (2026-11-06): the shared HTTP layer (`src/app/api/v1/_http/`), the contracts (`src/contracts/api/v1/`), the generated OpenAPI document, and `GET /api/v1/health`. Reservation endpoints are **planned** and arrive with M6–M9. The build spec is [0001](../specs/0001-m4-backend-foundations.md). The other Route Handlers, `/admin/(protected)/media/upload` and `/media/[...key]`, predate `/api/v1` and keep their own shape.

## Shape

- Base path `/api/v1`. Public resources sit at the top level; staff resources under `/api/v1/staff`. There are no role-named prefixes.
- JSON only (`application/json; charset=utf-8`). Requests with a body must send `Content-Type: application/json`, otherwise `415`. Bodies are capped at 32 KB (`413`).
- Field names are `camelCase`. Dates are `YYYY-MM-DD`. Instants are ISO 8601 UTC with `Z`. Money is `{ "amountMinor": 7000, "currency": "USD" } ($70.00)`.
- Ids are opaque strings. Public resources use slugs (`branchSlug`, `roomSlug`) and references; staff resources use ids.
- Responses are DTOs from `src/contracts/api/v1`, never Prisma or domain objects. Unknown request fields are rejected (`.strict()`), which prevents mass assignment.
- Every response carries `Cache-Control: no-store`, except public catalog `GET`s (`private, max-age=0, must-revalidate`; availability is never cached). It also carries `X-Content-Type-Options: nosniff` and `X-Request-Id`.

## Methods and status codes

| Situation | Code |
| --- | --- |
| Read | `200` |
| Created | `201` with a `Location` header |
| Idempotent replay of a create | `200` (same body shape) |
| Accepted, outcome delivered out of band (manage-link request) | `202` |
| Success without body (delete a block) | `204` |
| Malformed JSON, missing `Idempotency-Key`, bad query syntax | `400` |
| Not signed in (staff) / missing or invalid guest token | `401` |
| Signed in but lacking capability or branch (explicit branch parameter) | `403` |
| Resource missing **or in a branch the caller cannot access** | `404` |
| Business conflict (inventory, transition, assignment, price changed) | `409` |
| Stale `If-Match` / `expectedVersion` | `412` |
| Wrong content type / body too large | `415` / `413` |
| Well-formed but semantically invalid (dates, occupancy, field rules) | `422` with `fieldErrors` |
| Rate-limited | `429` with `Retry-After` |
| Lock timeout / transient database error | `503` with `Retry-After` |

## Pagination, filtering, sorting

- Cursor-free offset pagination, matching the existing admin `PageRequest`: `?page=1&pageSize=25` (max 100). The response is `{ items, page, pageSize, total }`.
- Filters are explicit query parameters (`status`, `source`, `from`, `to`, `q`) validated by Zod. Unknown parameters return `400`.
- Sorting uses `?sort=checkIn` or `?sort=-createdAt` from an allowlist per endpoint.

## Concurrency headers

- `Idempotency-Key` is required on every `POST` that creates a reservation.
- Reservation `GET` returns `ETag: "v<version>"`. Mutations require `If-Match` (or `expectedVersion` in the body for clients that cannot set headers). A mismatch returns `412`.

## Authentication and CSRF

- **Public**: no authentication; rate-limited per client key (an HMAC of the client address, the existing `LoginThrottle` pattern) and per resource.
- **Guest**: `Authorization: Bearer <manage token>` (ADR 019).
- **Staff**: the Better Auth session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`). Every handler resolves the principal through `getCurrentStaff()` (database session check). Branch assignments are reloaded per request.
- **CSRF** for cookie-authenticated, state-changing requests: require an `Origin` equal to `APP_URL` and `Sec-Fetch-Site: same-origin` when present (the existing `isSameOriginRequest`), plus `Content-Type: application/json`, which forces a CORS preflight that the API does not grant. Never mutate on `GET`.
- **Webhooks**: the Paymob callback (`/api/v1/payments/paymob/callback`, ADR 025) uses the `webhookRoute` wrapper instead: no session and no browser CSRF check, the raw body is kept for HMAC verification, and an unverified request gets `401` with no detail.
- **CORS**: none. The API answers same-origin only until a future client is approved. A non-browser client would then need a token mechanism (for example a Better Auth bearer or API-key plugin), added under its own ADR.

## Handler anatomy

```ts
// src/app/api/v1/staff/reservations/[id]/pms-entry/route.ts  (illustrative)
export const POST = staffRoute(
  { route: "/api/v1/staff/reservations/[id]/pms-entry", body: markPmsEntryBody },
  async ({ staff, body, params, setBranch }) =>
    toHttp(await reservations().markEnteredInHotelSystem(staff, { id: params.id, ...body }), {
      ok: (value) => json(200, toReservationDto(value)),
    }),
);
```

The wrappers in `src/app/api/v1/_http/` (`publicRoute`, `staffRoute`, `webhookRoute`) own body parsing, size and content-type checks, Zod validation, CSRF, principal resolution, problem mapping, request ids, and logging. The wrapper has no `capability` option. The use case owns authorization (it calls `authorize` and `authorizeBranch` itself, so the authorization sweep covers it), business rules, and transactions. The handler maps fields, and calls `setBranch` for the log line, and nothing else. Refusals (`413`, `415`, `400`, CSRF `403`, `401`) never reach the handler. A thrown error becomes `500 INTERNAL` with only the request id; the log gets the error name and stack frames, never its message. The exact rules (body cap, request-id format, log fields) are in the spec's standard definition. Every `route.ts` is checked by `tests/unit/architecture/route-handlers.test.ts` (D-10).

## OpenAPI

- `npm run openapi` builds `docs/api/openapi.json` (OpenAPI 3.1) from the contract schemas using Zod 4's `z.toJSONSchema()`, plus a small route registry that lists method, path, security, request schema, response schemas, and error codes.
- A unit test regenerates it in memory and fails if the committed file differs.
- Optionally served at `GET /api/v1/openapi.json` (public, read only) once approved.

## Versioning and deprecation

Additive changes, such as a new optional field or a new endpoint, stay in v1. Removing or renaming a field, or changing its meaning, requires `/api/v2`. v1 then stays for at least one release with a `Deprecation` header.

## Logging

Each request logs one line: request id, method, route pattern (not raw path), status, duration, principal id or `public`, and branch id. It never logs bodies, guest personal data, tokens, `Authorization` headers, or cookies.
