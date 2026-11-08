# Engineering standards

The authoritative coding standards for Rivana Residence, for humans and coding agents. They codify what the accepted codebase already does, plus the reservation-specific rules. Architecture boundaries are in [architecture/dependency-rules.md](../architecture/dependency-rules.md).

## Non-negotiables

1. **Next.js is the only application framework.** No NestJS, Express, Fastify, or second server. REST APIs are Next.js Route Handlers under `src/app/api/v1`.
2. **Business logic lives in `src/domain` and `src/application`,** never in pages, components, Route Handlers, or Server Actions.
3. **Server Actions are not the reservation API.** CMS forms may keep using them. Reservation mutations go through REST (ADR 014).
4. **Authorization and branch scope are enforced on the server**, inside use cases (`authorize`, `authorizeBranch`). UI hiding is a convenience.
5. **Reservation consistency is protected by PostgreSQL** (locks, constraints, transactions; ADR 016), never by in-memory state or frontend checks.
6. **Server-only code stays out of client bundles** (`import "server-only"`, the lint rules).
7. **Tests and docs ship with the change.** Never claim a check passed without running it.
8. **Work task by task** under the [agent workflow](./agent-workflow.md): plan approved before code, independent review, owner acceptance before the next task.

## TypeScript

- Strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (already on). No `any`. Avoid `as` casts; parse with Zod instead. Non-null `!` only where an invariant was just checked, and then prefer narrowing.
- `Readonly<…>` DTOs and `readonly` arrays at module boundaries, as in `src/application/ports/repositories.ts`.
- String-literal unions over TypeScript `enum`. Mirror Prisma enums with `as const` arrays in `src/domain/shared/types.ts`.
- Use the `@/` import alias. No circular imports.

## Errors and results

- Expected outcomes (validation, not found, conflict, forbidden) return `Result<T>` from `src/application/shared/result.ts`. Add codes to `ApplicationErrorCode` rather than throwing.
- Throw only for programmer errors and infrastructure failures. Handlers translate those to `500` with a request id.
- Domain validation uses Zod schemas plus `DomainValidationError` and issues, as in `src/domain/rooms/room.ts`.

## Validation

- Zod at every boundary: env, `FormData`, JSON bodies, query strings, route params. `.strict()` objects for request bodies.
- Bound every string and number (lengths, ranges). Normalize emails (lower-case, trimmed) and references (upper-case).

## Dates and money

- Stay dates use `LocalDate` / `StayRange` (`YYYY-MM-DD`); never `Date` in domain logic. Instants are `Date` in UTC.
- "Today" comes from an injected `Clock` plus the branch time zone.
- Shared reservation values are implemented in `src/domain/shared/{local-date,stay-range,stay-policy,occupancy,money}.ts` (M6-T1). Use `localDateAt(clock.now(), branch.timeZone)` from `zoned-time.ts`; keep `validatePublicStay` separate from structural ranges so blocks and rate periods do not inherit booking limits.
- Money is integer minor units plus currency. No floats. Format only in presentation.
- Every `new PrismaPg(...)` passes `options: "-c TimeZone=UTC"`.

## Persistence

- Prisma and `pg` are used only in `src/infrastructure/db/**`. Repositories return DTOs, never Prisma types.
- Multi-step writes go through the unit of work (one transaction). No network I/O inside a transaction.
- Raw SQL only through tagged `$queryRaw`/`$executeRaw`. `$queryRawUnsafe` is banned.
- Migrations are additive and reviewed. SQL-only constraints go in the migration with a comment. Run the drift check.

## HTTP (Route Handlers)

- A handler parses, calls one use case, and maps the result through the shared `_http` helpers. Nothing else.
- Errors are problem+json from one serializer. Status codes follow [api/rest-api-conventions.md](../api/rest-api-conventions.md).
- State-changing staff endpoints pass the CSRF check. Creates require `Idempotency-Key`. Edits require `If-Match`.
- Never log bodies, personal data, tokens, cookies, or `Authorization` headers.

## React and UI

- Server Components by default; Client Components only for interaction (ADR 009). Route files stay thin and compose feature components.
- Client Components receive serializable DTOs. They call the typed API client for reservation data, never `fetch` with hand-written URLs.
- Styling is Tailwind utilities and the existing tokens and class helpers. No inline `style` attributes; document any exception.
- Motion: the existing `motion` components for ordinary animation, respecting reduced motion. GSAP only with a documented justification (none today).
- Accessibility: semantic HTML, labelled controls, errors linked with `aria-describedby`, focus management after submit, status messages in live regions, colour never the only signal.
- Handle loading, empty, error, success, and conflict states explicitly.

## Naming and structure

- Files are `kebab-case.ts(x)`. Components and classes are `PascalCase`. Use cases are verb phrases (`CreateWebsiteReservation`, or a class with methods named for actions, matching the existing `CatalogCommands` style).
- One responsibility per file. Prefer small pure functions. Use classes for use-case groups with injected ports, as existing code does.
- Names come from the [glossary](../domain/glossary.md). In code, `Room` means room type.
- Comments explain *why*, invariants, and non-obvious decisions, at the existing density (sparse). No commented-out code.

## SOLID and DRY, pragmatically

- Extract an interface when there is a real second implementation or a test seam (ports). Do not create interfaces for every class.
- One source for each rule: availability arithmetic, price resolution, state transitions, the capability map, and contract schemas.
- Do not merge code that merely looks similar but changes for different reasons.

## Testing

- Unit-test domain rules with table-driven cases. Integration-test repositories, constraints, use cases, and handlers against the real `*_test` database. E2E covers journeys.
- Inject `Clock`, `IdGenerator`, `SecureTokenGenerator`, and email; there are no real network calls in tests.
- Tests use `data-*` hooks or accessible roles, not Tailwind class names.
- A new protected use case is added to the authorization sweep.

## Git

- One branch per milestone or phase (`m4-backend-foundations`, following the existing `phase-N-name` style). One commit per task, made when the owner accepts the task ([agent-workflow.md](./agent-workflow.md)). An accepted milestone is pushed and merged into `main`, and `main` is pushed. Push nothing else unless asked.
- Never commit `.env*` (except `.env.example`), credentials, or real guest data.

## Intentional exceptions

| Exception | Where | Reason |
| --- | --- | --- |
| `style-src 'unsafe-inline'` in CSP | `security-headers.ts` | Server-rendered React and `next/image` emit `style=""` attributes (Phase 11) |
| Reporting reads other modules' tables | `infrastructure/db/prisma/repositories/reporting` | Read-only statistics with no rules of their own (module-boundaries) |
| Booking unit of work spans modules | `infrastructure/db/prisma/unit-of-work.ts` | One transaction is required for correctness (ADR 016) |
