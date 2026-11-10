# src/app/api: REST Route Handlers

The versioned REST API (`/api/v1/**`). Conventions: [docs/api/rest-api-conventions.md](../../../docs/api/rest-api-conventions.md); errors: [docs/api/error-model.md](../../../docs/api/error-model.md); endpoint list: [docs/api/api-contracts.md](../../../docs/api/api-contracts.md); build spec: [docs/specs/0001-m4-backend-foundations.md](../../../docs/specs/0001-m4-backend-foundations.md).

## Layout

- `v1/_http/`: the shared HTTP layer. `routes.ts` (`createRoutes`, `json`, `toHttp`), `problem.ts` (RFC 9457 bodies and the one code to status table), `body.ts` (`parseJson`, `validate`), `logger.ts` (one redacted line per request). `index.ts` wires the wrappers to `@/composition/api`.
- `v1/<resource>/route.ts`: one file per endpoint. `v1/health/route.ts` is the reference example; `v1/branches/**` and `v1/staff/branches/**` show public and staff resources (M5).
- `v1/_dto/`: view model → contract DTO mappers (e.g. `branches.ts`). DTOs are built from public view models, never from Prisma rows, so the API shows exactly what the pages show.

## Rules

- Every exported method is built from a wrapper: `export const GET = publicRoute(…)`, `staffRoute(…)`, or `webhookRoute(…)`. Never a bare `export async function`. The wrappers apply CSRF on unsafe staff methods, the 32 KB body cap, strict Zod validation (`422 VALIDATION` with `fieldErrors`), problem mapping, `Cache-Control: no-store`, `X-Request-Id`, and the log line.
- Pass `route` as the pattern (`"/api/v1/branches/[slug]"`), never the raw path. It is what gets logged.
- Public limiter wiring uses `RateLimiter` and `PublicRateLimitStore` for atomic fixed-window admission. Reuse `AVAILABILITY_RATE_LIMIT` for P5 across branches; missing trusted client addresses share an anonymous bucket. Staff sign-in keeps its separate throttle policy. Expired availability buckets are pruned through `npm run throttles -- cleanup-public` (see the deployment guide).
- P5 uses `_query/availability.ts` for numeric transport conversion and duplicate detection: missing/unknown/duplicate parameters are 400, while date, occupancy, quantity and stay values are checked by the application/domain and return 422. Its composition bypasses marketing caches and its DTO mapper exposes only public listing summaries, capped selectable quantity, and accommodation prices.
- A handler parses, calls one use case, and maps the result with `toHttp`. Business rules, `authorize`, and `authorizeBranch` live in the use case, not here.
- No import from `@/infrastructure/**` or the generated Prisma client. Get use cases from `@/composition/*`.
- Each `route.ts` stays within 60 lines.
- Request and response schemas live in `src/contracts/api/v1` (Zod only) and are registered in `routes.ts` there. After adding or changing an endpoint, run `npm run openapi` and commit `docs/api/openapi.json`; a freshness test fails otherwise.
- Never log bodies, cookies, tokens, or `Authorization`. Only the logger's allow listed fields are written.
- `webhookRoute` keeps the raw bytes for signature checks and skips the session and CSRF checks; the use case must verify the signature.
- Tests: wrappers are unit tested over plain `Request` objects with `createRoutes` and fakes (`tests/unit/api/http-layer.test.ts`); D-10 is checked in `tests/unit/architecture/route-handlers.test.ts`.

_Drafted by /sync from the introducing change, worth a quick human pass._
