# Promotions and coupons

Status: the **promotion popup** described in the first section was built in Phases 5 and 7, **retired by the client on 2026-11-06 (Q-47)**, and **removed in M5** (2026-11-07). **Coupons** are **partly implemented**: the pure validation rules and code handling (M7-T2) and persistence (M7-T3) are accepted (2026-11-11); management APIs (M7-T5) are accepted (2026-11-13); the quote (M7-T6), redemption (M8), and screens (M10, M12) are planned, and offers reach guests through WhatsApp broadcasts (M13). See [ADR 027](../adr/027-booking-price-composition.md) and [ADR 028](../adr/028-whatsapp-guest-messaging.md).

## Promotion popup (removed in M5)

What it was, for the record: staff created, scheduled, previewed, published, prioritized, and archived campaigns in `/admin/promotions`, and the public site showed at most one active campaign in an accessible popup with a code to copy. Rivana never validated the code or calculated a discount.

What M5 removed (spec [0002](../specs/0002-m5-branch-websites.md)):

- The popup and its client controller from the public layout, and its styles.
- `/admin/promotions` (navigation and every route), the overview widgets, and the `promotions:manage` capability.
- The promotion use cases, repository, domain rules, `promotion:active` cache tag, and their tests. A unit test guards that no public route or site component imports promotion code again.

What stays: the `Promotion` table and its rows, unused, until a later expand-and-contract migration drops it. The accepted Phase 5 and Phase 7 reports and screenshots keep showing the popup as it was built.

## Coupons (partly implemented)

**Implemented storage (M7-T3):** `Coupon` and `CouponBranch` persist explicit USD currency, kind-specific values, optional windows and positive limits, activity, descriptions, and audit references. PostgreSQL enforces case-insensitive code uniqueness for inserts and edits. Demo coupons are fictional and scoped to `demo-giza` when created; seed reruns preserve staff edits. Management authorization, audited staff writes, and branch-list consistency are implemented in T5; quote integration remains T6.

A coupon is a code a guest enters while booking that **changes the quote and the total**. Coupons are distinct from date-based prices: date periods set the nightly accommodation price automatically by stay date (PR-2…4); coupons are opt-in discounts on the whole booking.

### Definition

| Field | Rules |
| --- | --- |
| `code` | Printable allowlist, bounded length, unique case-insensitively, shown in upper case |
| `kind` and value | `PERCENT` with basis points (1–10 000; 15% = 1500), or `FIXED` with an amount in USD cents |
| Validity | Optional `startsAt` and `endsAt` (server time; `endsAt > startsAt`) |
| Limits | Optional total redemptions; optional redemptions per verified phone |
| Branch scope | All branches, or a list of branches |
| `active` | Switch; inactive codes are refused |
| `description` | Staff-only note |

**Implemented management (M7-T5):** Admin sees and manages every code; a Manager sees and manages only non-global coupons with a nonempty branch list entirely within their assignments (`coupons:manage`). Global coupons and coupons spanning any unassigned branch are hidden from Managers, including list counts; an inaccessible coupon edit returns `404`, and an attempted scope expansion returns `403`.

Codes are trimmed and normalized to uppercase (3–32 letters, digits, hyphens, or underscores) and are immutable after creation. Staff can change kind and value, validity, limits, scope, activity, and description. A global coupon requires an empty branch list; otherwise it requires distinct, existing branches. PATCH retains omitted fields and clears optional fields with `null`; its complete resulting state must be valid. Changes, branch joins, and `coupon.create` or `coupon.update` audit records commit together. Audit stores before and after values, with a description change flag instead of free text; identical patches add no audit event.

PATCH takes the coupon row lock before reading and merging state, then rechecks current and resulting scope. A busy row returns `503 TRY_AGAIN` after five seconds. List filtering and branch hydration use one PostgreSQL statement snapshot to prevent disclosure during concurrent scope edits. Redemption counts are zero until M8 adds their persistence. The API has no coupon deletion endpoint.

### Use in a booking

1. The guest enters one code (FR-CPN-3). The quote endpoint validates it and returns the discount, or a refusal reason (CP-7).
2. The discount applies to the subtotal (accommodation + services) before VAT (CP-4, CP-5, TX-2).
3. The booking transaction re-validates the code and locks the coupon row before counting redemptions, so limits hold under concurrency (CP-3). The reservation stores the code, kind, value, and discount in its snapshot, and a `CouponRedemption` row records the use.
4. A redemption is released when the payment fails or the hold expires, and (recommended, Q-57) when the reservation is cancelled.
5. Staff bookings may use codes (recommended, Q-57).

Q-57 recommendations are accepted by the M7 brief: release on cancellation or payment failure, no minimum nights or amount, and staff bookings may use codes. Redemption writes remain M8 scope.

### Distribution

Codes are not shown on the website. Admin and Managers send them in WhatsApp marketing broadcasts to guests who opted in (FR-MKT, ADR 028). A broadcast may attach a coupon; the coupon's own rules still decide whether it is accepted.

## Analytics

If analytics is approved, record only non-sensitive events (coupon applied, coupon refused with reason), keyed by coupon id. Do not store guest identity or reservation details in analytics.
