# ADR 014 — Versioned REST API through Next.js Route Handlers

Status: **Accepted** (2026-10-24)

## Context

The CMS mutates data through same-origin Server Actions (ADR 007, [architecture/overview.md](../architecture/overview.md)), and that stays. Reservations must be callable by clients other than the website: a future mobile app, a PMS integration, or partner tools. Next.js is the only allowed application framework ([ADR 001](./001-nextjs-app-router.md)).

## Problem

Which transport carries reservation operations, and how do we keep it reusable, documented, and consistent?

## Options considered

1. **Server Actions only.** Tied to React forms. Their action IDs are not a stable public contract, and they cannot be called by non-React clients. Rejected as the primary API.
2. **Separate API server** (NestJS, Express, Fastify). Forbidden by the Next.js-only rule.
3. **tRPC or GraphQL inside Next.js.** Adds a dependency and a non-REST contract; not requested.
4. **REST over App Router Route Handlers** under `src/app/api/v1/**`, with thin handlers delegating to application use cases.

## Decision

Option 4.

- Prefix: `/api/v1`. A breaking contract change creates `/api/v2`; additive changes stay in v1.
- Public endpoints live under `/api/v1/...` (branches, room types, availability, quotes, reservations, guest access). Staff endpoints live under `/api/v1/staff/...`, with resource paths rather than role names (`/staff/reservations`, not `/receptionist/...`), because authorization is per capability and branch, not per URL prefix.
- JSON request and response bodies; errors use RFC 9457 `application/problem+json` ([error-model.md](../api/error-model.md)).
- Request and response DTOs are Zod schemas in `src/contracts/api/v1/`. The handlers, the typed frontend client, and the OpenAPI document all use them.
- OpenAPI 3.1 is generated from those schemas with Zod 4's built-in `z.toJSONSchema()` (no new dependency) by a script, and a unit test fails when the committed `docs/api/openapi.json` is stale.
- Server Components read through application queries directly, not through the API. Next.js documents an HTTP round trip to your own Route Handler from a Server Component as an anti-pattern (`node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md`, "Caveats"). Client Components that mutate reservation data call the REST API through the typed client. One set of use cases serves both paths.
- Server Actions may still be used for CMS forms and for narrowly justified internal UI interactions. They are never the only way to perform a reservation operation.

## Rationale

REST over Route Handlers needs no new framework, and Web `Request`/`Response` are portable. The existing `/admin/(protected)/media/upload/route.ts` already shows the pattern: same-origin check, session, application call, explicit status mapping.

## Consequences

- A shared HTTP layer is needed (body size limits, JSON parsing, Zod validation, problem mapping, auth wrappers, request IDs). It lives in `src/app/api/v1/_http/`, which may use the composition root.
- Cookie-authenticated staff mutations need CSRF protection, because Server Actions' built-in origin checks do not apply to Route Handlers (see the threat model).
- Two mutation styles coexist: Server Actions for CMS, REST for reservations. [engineering-standards.md](../engineering/engineering-standards.md) says which to use.

## Risks

- Contract drift between handlers and docs. Mitigation: one Zod source and the stale-OpenAPI test.
- Over-fetching or chatty UIs. Mitigation: shape endpoints around screens' real needs, and paginate lists.
