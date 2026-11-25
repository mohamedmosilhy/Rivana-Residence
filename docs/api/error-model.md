# API error model

Status: design accepted 2026-10-24, extended 2026-11-06 (coupons, services, payments, cancellation requests). **Implemented in M4:** the serializer and the single code-to-status table (`src/app/api/v1/_http/problem.ts`) for the existing application codes (`VALIDATION`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, plus `TRY_AGAIN`), the transport codes, and `INTERNAL`. The pre-existing codes `INVALID_CREDENTIALS` (401), `NOT_PUBLISHABLE` (422), and `REFERENCED` (409) are mapped too. **Implemented in M6-T4:** typed `INVENTORY_UNAVAILABLE` context and its 409 mapping. The other reservation codes remain planned and join the union and table with the milestones that use them.

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
| `PRICE_CHANGED` | 409 | `context.quote` contains the updated price. G6 includes the full current and proposed quotes in `context.quote.preview`. |
| `INVALID_TRANSITION` | 409 | `context.status` (current). **Implemented (M8-T9)** |
| `ROOM_ALREADY_ASSIGNED` | 409 | |
| `ROOM_BLOCKED` | 409 | |
| `BRANCH_NOT_BOOKABLE` | 409 | Branch inactive, online booking disabled, WhatsApp not configured, or check-in time missing; `context.reason` is `ONLINE_BOOKING_DISABLED`, `CHECK_IN_TIME_MISSING` or `WHATSAPP_NOT_CONFIGURED` (**implemented M8-T7b**; public inactive branch: 404 instead). **Planned (M9-T12, ADR 031):** the WhatsApp reason becomes `NO_VERIFICATION_CHANNEL` and applies only when neither WhatsApp nor email is ready |
| `ROOM_TYPE_NOT_BOOKABLE` | 409 | Unpublished, no units, or unpriced nights |
| `STALE_VERSION` | 412 | `context.currentVersion`. **Implemented (M8-T9)**: the `If-Match` version no longer matches |
| `PRECONDITION_REQUIRED` | 428 | **Implemented (M8-T9)**: a reservation write sent no usable `If-Match` |
| `PMS_UPDATE_STALE` | 409 | **Implemented (M8-T9)**: S55 named a change that is not the latest; `context.currentChangeSeq`; the flag stays set |
| `NO_PMS_UPDATE_PENDING` | 409 | **Implemented (M8-T9)**: S55 on a reservation with no pending hotel system update |
| `IDEMPOTENCY_KEY_REUSED` | 422 | Same key, different body |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | Concurrent duplicate still running |
| `EXTERNAL_REFERENCE_EXISTS` | 409 | The external reference already exists in the branch (S4) |
| `TRY_AGAIN` | 503 | Lock timeout or transient failure |
| `PHONE_NOT_VERIFIED` | 401 | Missing, expired, or already used phone verification token |
| `PHONE_BLOCKED` | 403 | The number is blocked (Q-29); `detail` asks the guest to contact the hotel and reveals nothing else |
| `VERIFICATION_CODE_INVALID` | 422 | `context.attemptsLeft` |
| `VERIFICATION_EXPIRED` | 410 | Code expired or attempts used up; request a new code |
| `VERIFICATION_UNAVAILABLE` | 503 | WhatsApp could not deliver the code; `Retry-After` |
| `COUPON_INVALID` | 422 | `context.reason`: `NOT_FOUND`, `INACTIVE`, `NOT_YET_VALID`, `EXPIRED`, `WRONG_BRANCH`, `LIMIT_REACHED`, `PHONE_LIMIT_REACHED`; `fieldErrors.couponCode`. The message never confirms whether a code exists at another branch beyond `WRONG_BRANCH` **Implemented (M7-T6)**: the same message for every reason, a malformed or over long code is `NOT_FOUND`. |
| `SERVICE_UNAVAILABLE` | 409 | `context.kind`; the service is off at this branch. **Implemented (M7-T6).** |
| `BOOKING_LIMIT_REACHED` | 429 | Per-phone cap on upcoming pay-at-hotel bookings or open payment holds (Q-60); `detail` asks the guest to contact the hotel |
| `PAYMENT_METHOD_UNAVAILABLE` | 409 | **Implemented (M9-T4, CP-6).** P7 refuses online payment when the gateway is unavailable, the branch switch is off, or the total is zero. The retired `PAYMOB` value returns `422 VALIDATION`. |
| `PAYMENT_UNAVAILABLE` | 503 | **Implemented (M9-T4).** Checkout could not be opened. A definite refusal sets the reservation to `PAYMENT_FAILED` and releases inventory and coupon use. An ambiguous outcome keeps the hold for retry with the same key and request body. |
| `WEBHOOK_SIGNATURE_INVALID` | 401 | Payment callback failed the adapter's signature verification; body is minimal **Implemented (M9-T5).** Also returned when no gateway is configured. |
| `CHANGE_NOT_ALLOWED` | 403 | **Implemented (M9-T10).** `context.reason` is `DEADLINE_PASSED`, `REQUEST_OPEN`, `PHONE_BLOCKED`, or `STATUS`. A deadline refusal also includes `context.deadline` (UTC or null) and `context.branch` (`name`, `slug`, `phone`, `email`). |
| `CANCELLATION_WINDOW_CLOSED` | 409 | **Implemented (M9-T7).** At or after the deadline, or when the branch lacks a check-in time. `context.deadline` is a UTC instant or null. `context.branch` contains `name`, `slug`, `phone`, and `email`. |
| `CANCELLATION_REQUEST_EXISTS` | 409 | **Implemented (M9-T7).** An active request already exists for the reservation. |
| `EMAIL_NOT_CONFIGURED` | 503 | **Planned (M9-T12, ADR 031).** The email channel was requested but no email adapter is configured; nothing is sent |
| `WHATSAPP_NOT_CONFIGURED` | 503 | Business number, access token, or the template for this purpose is missing; nothing is sent (verification requests fail this way while the number is a placeholder) |
| `WHATSAPP_TEST_FAILED` | 502 | The Admin's test message was refused by the provider; `detail` carries the provider's error text without secrets |
| `REFUND_FAILED` | 502 | The payment gateway refused or failed the refund; the request is `REFUND_FAILED` and can be retried (S45) |

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
- Coupon refusals never reveal other codes, redemption counts, or other guests' usage.
- Payment errors never echo provider payloads, card details, or secrets.
- Error responses go through the same serializer in every handler. Handlers never build ad-hoc error JSON.
