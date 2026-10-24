# API error model

Status: **Planned**, design accepted 2026-10-24

Errors use RFC 9457 Problem Details (`Content-Type: application/problem+json`):

```json
{
  "type": "https://rivanaresidence.com/problems/inventory-unavailable",
  "title": "The room is no longer available",
  "status": 409,
  "code": "INVENTORY_UNAVAILABLE",
  "detail": "Studio with Balcony is fully booked on 2026-11-14.",
  "requestId": "01J…",
  "fieldErrors": { "checkIn": ["Choose a date from today onwards."] },
  "context": { "firstUnavailableNight": "2026-11-14" }
}
```

- `code` is the stable machine contract. `title` and `detail` are safe, human-readable English that can be shown to users.
- `fieldErrors` is present for `422`, keyed by request field path (`guest.email`).
- `context` carries non-sensitive extra data documented per code.
- Unexpected errors return `500 INTERNAL` with only the `requestId`. Details go to the server log, never the response.

## Mapping from application results

The application layer already returns `Result<T>` with `ApplicationErrorCode` (`src/application/shared/result.ts`). Reservation codes are added to that union, and the HTTP layer maps them in one table:

| Application code | HTTP | Notes |
| --- | --- | --- |
| `VALIDATION` | 422 | `fieldErrors` |
| `UNAUTHENTICATED` | 401 | |
| `FORBIDDEN` | 403 | |
| `NOT_FOUND` | 404 | Also used for resources in inaccessible branches |
| `CONFLICT` | 409 | Generic unique conflict (existing) |
| `RATE_LIMITED` | 429 | `Retry-After` |
| `INVENTORY_UNAVAILABLE` | 409 | `context.firstUnavailableNight` (staff also get `roomTypeId`) |
| `PRICE_CHANGED` | 409 | `context.quote` (new per-night breakdown) |
| `INVALID_TRANSITION` | 409 | `context.status` (current) |
| `ROOM_ALREADY_ASSIGNED` | 409 | |
| `ROOM_BLOCKED` | 409 | |
| `BRANCH_NOT_BOOKABLE` | 409 | Branch inactive or online booking disabled (public: 404 instead) |
| `ROOM_TYPE_NOT_BOOKABLE` | 409 | Unpublished, no units, or unpriced nights |
| `STALE_VERSION` | 412 | `context.currentVersion` |
| `IDEMPOTENCY_KEY_REUSED` | 422 | Same key, different body |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | Concurrent duplicate still running |
| `EXTERNAL_REFERENCE_EXISTS` | 409 | `context.reservationId` (staff only) |
| `TRY_AGAIN` | 503 | Lock timeout or transient failure |
| `PHONE_NOT_VERIFIED` | 401 | Missing, expired, or already used phone verification token |
| `PHONE_BLOCKED` | 403 | The number is blocked (Q-29); `detail` asks the guest to contact the hotel and reveals nothing else |
| `VERIFICATION_CODE_INVALID` | 422 | `context.attemptsLeft` |
| `VERIFICATION_EXPIRED` | 410 | Code expired or attempts used up; request a new code |
| `VERIFICATION_UNAVAILABLE` | 503 | WhatsApp could not deliver the code; `Retry-After` |

Transport-level errors produced by the HTTP layer before the use case runs:

| Code | HTTP |
| --- | --- |
| `MALFORMED_JSON`, `MISSING_IDEMPOTENCY_KEY`, `INVALID_QUERY` | 400 |
| `PAYLOAD_TOO_LARGE` | 413 |
| `UNSUPPORTED_MEDIA_TYPE` | 415 |
| `CROSS_SITE_REQUEST` | 403 |

## Rules

- Public guest endpoints never reveal another phone's reservations: a reference that does not belong to the session's phone returns `404`.
- Code requests answer the same way whether or not the phone has reservations; only a blocked phone gets a different, neutral message.
- Validation messages never echo submitted personal data.
- Error responses go through the same serializer in every handler. Handlers never build ad-hoc error JSON.
