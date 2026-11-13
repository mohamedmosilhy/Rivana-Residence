# 2. Requirements, users, roles

## Users
| Who | Does | Login |
| --- | --- | --- |
| Guest | Browses, books, requests cancellation | No account; WhatsApp code proves phone; secret manage link opens one booking |
| Editor | Website content only, no reservation data | Staff account |
| Receptionist | Front desk, assigned branches | Staff account |
| Manager | Receptionist + prices, services, coupons, cancellation/refund decisions, WhatsApp offers, reports | Staff account, assigned branches |
| Admin | Everything, all branches, staff, VAT, settings | Staff account |

- Staff accounts are created by an Admin; no public sign-up.
- Permissions are **capabilities** (`src/domain/auth/capabilities.ts`, e.g. `cancellations:decide`) plus **branch scope** (a receptionist at branch A cannot see branch B; no assignment = nothing).
- Enforced in use cases on the server. Reservation capabilities exist but nothing uses them until M6+.

## Business goals (8)
Instant-confirmation booking with correct availability/price/VAT; one place per branch for receptionists; manager stats and price control; fast, accessible, SEO-friendly luxury site; minimize double bookings; room for a future PMS integration; non-technical content management; coupons, WhatsApp offers and feedback.

## Rules guests and staff notice
- Prices per unit per night, USD only, entered before VAT; date periods override the base price. One global VAT rate shown separately. Coupons (percent/fixed) reduce the amount before VAT. Breakfast and airport transfer are priced by a unit each branch chooses (per booking, per night, per person, or per person per night, with an optional child price), only if chosen.
- Phone verification via WhatsApp code for every online booking; Manager/Admin can block a number.
- Guests *request* cancellation until 24h before check-in; Manager/Admin decides; paid bookings refunded via Paymob.
- Pay online (Paymob) or at the hotel. Important actions audited. Data kept forever.
- Out of scope: customer passwords, loyalty, other currencies, CSV export, partial refunds, other payment providers.

## Workflows
- **Website booking**: choose branch/dates/units/extras/coupon → verify phone → server locks, checks, prices, writes in one transaction. Pay at hotel → `CONFIRMED`. Paymob → `AWAITING_PAYMENT` (hold ~15 min) → `CONFIRMED` on verified callback, else released. Confirmations after commit. Receptionist enters it in the PMS and marks it entered; PMS already full = cross-system conflict.
- **PMS-only booking**: recorded in Rivana as `EXTERNAL`; refusal because already sold online = conflict.
- **Staff booking**: create in Rivana first (lock protects it), then PMS.
- **Sync** every 30 min (per-branch setting): sound + pop-up, receptionist reconciles, clicks "I have synced" → checkpoint.
- **Maintenance**: block a physical room; Rivana refuses a block that would oversell.

## Vocabulary
Branch; Room (code name for a *listing*, `accommodationType` ROOM/APARTMENT); Unit (`PhysicalRoom`, e.g. "204"); Stay `[checkIn, checkOut)`; Reservation with room lines; minor units (cents); Quote vs immutable price snapshot; Idempotency key; Source WEBSITE/STAFF/EXTERNAL; inventory-consuming statuses AWAITING_PAYMENT, CONFIRMED, CHECKED_IN, CHECKED_OUT.

## Remember
Four staff roles + anonymous guests; capability + branch scope. Booking is specified, not built. Immediate confirmation unchecked against the PMS is the biggest business risk.

Read: `docs/requirements/stakeholders-and-workflows.md`.
