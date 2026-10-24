# Test matrix

Planned tests for the reservation features, by layer, with the ids used in the [traceability matrix](../requirements/scope-traceability-matrix.md). Existing website and CMS tests are described in [testing-strategy.md](./testing-strategy.md) and live under `tests/`.

## Unit (domain/application; no database)

| Id | Subject | Cases |
| --- | --- | --- |
| T-DATE-1…8 | `LocalDate`, `StayRange` | Parse and validate (2027-02-29 invalid, 2028-02-29 valid); nights; adjacency (no overlap); partial and contained overlap; zero and negative length; max stay; horizon; branch "today" across Cairo DST change dates |
| T-AV-1…6 | `AvailabilityCalculator` | All nights free; one night full; capacity 0 from blocks; quantity > free; empty stay rejected; reason reported |
| T-PR-1…8 | `PriceResolver` | Base only; seasonal boundary (end exclusive); offer beats seasonal; unpriced night; worked example ($260.00); total sum; snapshot immutability; override needs reason |
| T-LIFE-1…12 | `ReservationStateMachine` | Each allowed transition; each forbidden one; date preconditions for check-in and no-show; early check-out shortening |
| T-REF-1…3 | Reference generator | Alphabet, length, normalization of ambiguous characters |
| T-PHONE-1…4 | `PhoneNumber` | Normalization to E.164, invalid numbers, equality across formats (`+20 100…` vs `0100…` with country) |
| T-SYNC-1…5 | Sync due calculation | Due at last completed + interval; `STARTED` moves the next reminder to + follow-up delay; a new `COMPLETED` clears it; interval change applies to the next reminder; settings bounds |
| T-AUTHZ-1 | Capability matrix | Table-driven against [user-roles-and-permissions.md](../requirements/user-roles-and-permissions.md) |
| T-AUTHZ-2 | Authorization sweep (extended) | Every reservation use case × role × branch refuses before any port call |
| T-VAL-1…5 | Contract schemas | Strict unknown-field rejection; guest field limits; control characters; idempotency key format |
| T-ARCH-1…4 | Boundaries | D-7, D-8, D-9, D-11 from [dependency-rules.md](../architecture/dependency-rules.md); OpenAPI freshness |

## Integration (real PostgreSQL)

| Id | Subject |
| --- | --- |
| T-DB-1…8 | Migrations apply on a copy of current data; `Room.branchId` backfill; composite FKs reject cross-branch rows; exclusion constraints; checks; unique reference, idempotency (`NULLS NOT DISTINCT`), and external reference; drift check |
| T-RES-1…10 | Create website, staff, and external reservations end to end (snapshot, audit, outbox rows); price changed; inactive branch; unpublished room; occupancy; replay; key reuse with a different body |
| T-INV-1…6 | Blocks refused when overselling; unit deactivation; overlap; capacity read model |
| T-LKP-1…5 | Token hash lookup, expiry, rotation; lookup `202` both ways; guest cancel releases inventory |
| T-RPT-1…5 | Report definitions on a fixed dataset (occupancy, revenue excluding unpriced, cancellations) |
| T-GST-1…10 | Code request and confirm (hash stored, 10-minute expiry, 5 attempts, per-number and per-client limits); token single use; blocked number gets no code and existing tokens fail; guest profile upsert on booking; staff entry links or creates an unverified profile; block and unblock audited and limited to `guests:block`; guest session sees only its phone's reservations |
| T-SYNCAPI-1…4 | Sync status and checkpoints per branch; one checkpoint clears all receptionists of the branch; branch access enforced; audit appended |
| T-AUD-1…3 | Audit appended in the same transaction (rollback leaves none); redaction |
| T-NTF-1…3 | Outbox claim `SKIP LOCKED`; retry with backoff; token scrubbed after send |
| T-WA-1…3 | `WhatsAppSender` contract with a fake adapter: template and variables, delivery failure maps to `VERIFICATION_UNAVAILABLE` or an outbox retry, no secrets or codes in logs |
| T-HTTP-1…10 | Route Handlers with `Request` objects: status mapping, problem shape, `415`/`413`, CSRF refusal, `401`/`403`/`404` cross-branch, `412`, `429`, `Location` header, `ETag` |
| C-1…10 | Concurrency ([database/integrity-and-concurrency.md](../database/integrity-and-concurrency.md#proof-plan-integration-tests-on-real-postgresql)) |

## E2E (Playwright, Chromium)

| Id | Flow |
| --- | --- |
| E2E-G-1 | Select branch → search → view rooms and prices → submit → reference shown → manage link works |
| E2E-G-2 | Last room: a second browser context gets "no longer available" |
| E2E-G-3 | Two branches with the same room names have independent inventory |
| E2E-G-4 | Guest cancels a pending request; the room becomes available again |
| E2E-G-5 | Validation and accessibility (axe) on every booking step, 320 px overflow sweep, touch targets |
| E2E-G-6 | Phone verification step: wrong code, expiry, resend; blocked number cannot book; "My reservations" with phone and code (fake WhatsApp adapter captures codes) |
| E2E-R-1 | Receptionist signs in and sees only their branch |
| E2E-R-2 | Confirm and decline pending requests |
| E2E-R-3 | Manual reservation; external reservation; external conflict notice |
| E2E-R-4 | Block a room; availability grid updates; refused block that would oversell |
| E2E-R-5 | Assign room, check in, check out |
| E2E-R-6 | Sync reminder: with a fake clock the pop-up opens on any dashboard page when due, cannot be dismissed without an answer, "I'm syncing now" re-opens after the follow-up delay, and "I have synced" clears it in a second receptionist's browser |
| E2E-M-1 | Manager edits rates; existing reservation keeps its price |
| E2E-M-2 | Manager reports reflect seeded data |
| E2E-M-3 | Manager blocks a number with a reason; that number can no longer get a code; unblock restores it; receptionist sees no block button |
| E2E-A-1 | Admin CMS still works (existing suites unchanged) |
| E2E-A-2 | Receptionist and Manager get `403` / denied page on CMS routes and actions |
| E2E-A-3 | Admin assigns branch, and the receptionist's access changes on the next request |

