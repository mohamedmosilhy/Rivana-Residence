# Promotions and coupons

Status: the **promotion popup** described in the first section is **implemented** (Phases 5 and 7) and **retired by the client on 2026-11-06 (Q-47)**; its removal is scheduled for M5. **Coupons** are **planned** (M7 quote, M8 redemption, M10 and M12 screens), and offers reach guests through WhatsApp broadcasts (M13). See [ADR 027](../adr/027-booking-price-composition.md) and [ADR 028](../adr/028-whatsapp-guest-messaging.md).

## Promotion popup (implemented; removal planned in M5)

What exists today, kept here so the running system is described accurately until M5 removes it:

- Staff create, schedule, preview, publish, unpublish, prioritize, and archive campaigns in `/admin/promotions` (internal name, headline, body, code, optional terms, optional active window, popup flag, priority).
- The public site shows at most one active campaign in an accessible popup (published, popup enabled, inside its window; highest priority, then most recently published) and lets the visitor copy the code. Dismissal is stored in the browser for seven days per campaign version.
- Rivana does not validate the code, calculate a discount, or count redemptions. The popup says that terms apply.

M5 removes the popup from the public layout and retires the CMS area (no create, edit, or publish). The `Promotion` table stays read-only for one release and is dropped later by an expand-and-contract migration. The accepted Phase 5 and Phase 7 reports and screenshots keep showing the popup as it was built.

## Coupons (planned)

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

Who manages them: Admin for any code; a Manager only for codes limited to branches they are assigned to (`coupons:manage`). All changes are audited.

### Use in a booking

1. The guest enters one code (FR-CPN-3). The quote endpoint validates it and returns the discount, or a refusal reason (CP-7).
2. The discount applies to the subtotal (accommodation + services) before VAT (CP-4, CP-5, TX-2).
3. The booking transaction re-validates the code and locks the coupon row before counting redemptions, so limits hold under concurrency (CP-3). The reservation stores the code, kind, value, and discount in its snapshot, and a `CouponRedemption` row records the use.
4. A redemption is released when the payment fails or the hold expires, and (recommended, Q-57) when the reservation is cancelled.
5. Staff bookings may use codes (recommended, Q-57).

Still open (Q-57): release on cancellation, minimum nights or amount, and use on staff bookings, each with the recommendation shown.

### Distribution

Codes are not shown on the website. Admin and Managers send them in WhatsApp marketing broadcasts to guests who opted in (FR-MKT, ADR 028). A broadcast may attach a coupon; the coupon's own rules still decide whether it is accepted.

## Analytics

If analytics is approved, record only non-sensitive events (coupon applied, coupon refused with reason), keyed by coupon id. Do not store guest identity or reservation details in analytics.
