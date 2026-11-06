# Known limitations

Status: living document. Items marked *planned* describe the reservation design (not yet implemented), revised for the client decisions of 2026-11-06. Existing CMS limitations are in the phase reports, notably [phase-11-release-candidate.md](../delivery/reports/phase-11-release-candidate.md#residual-risks).

## Reservations (planned design)

| # | Limitation | Consequence | Mitigation |
| --- | --- | --- | --- |
| L-1 | **No integration with the hotel's operational system (PMS).** Synchronization is manual. | Rivana cannot guarantee zero overbooking across the two systems. A PMS booking not yet recorded in Rivana is invisible to the website. This is not real-time synchronization. | Record-external conflict detection; 30-minute sync reminders and checkpoints; PMS-entry marker on website bookings; manager review; ability to switch online booking off per branch |
| L-1a | **Immediate confirmation does not check the PMS** (Q-36). | A website booking is confirmed (and possibly paid) as soon as Rivana's own inventory allows it. If the PMS already sold that room-night and staff have not recorded it yet, the guest holds a confirmation for a room the hotel may not have. The later the manual sync, the higher the chance. | Record PMS bookings in Rivana within 30 minutes; enter website bookings in the PMS promptly and mark them entered; conflict procedure (relocate, or cancel with a refund); switch online booking off for a branch when the PMS is unavailable or sync is falling behind |
| L-2 | Availability shown in search can change before submission | A guest may see "no longer available" at the last step | Re-check under lock at creation, with a clear message |
| L-3 | Room-type counting can accept a stay that no single physical room can hold end to end | A room move may be needed mid-stay | Assignment screen highlights it; staff reassign |
| L-4 | Several units per booking must share the same dates (Q-39) | Different dates per unit need separate bookings | Staff can create linked bookings by phone |
| L-5 | Online payment is Paymob only, full prepayment; pay-at-hotel bookings carry no deposit (Q-37) | No-show risk on pay-at-hotel bookings; no partial refunds; Paymob's own fee policy applies to refunds; charged in USD (confirmed, Q-54) | Per-phone caps; policy text; staff follow-up; differences on prepaid bookings settled at the desk (Q-66) |
| L-6 | No password-based customer accounts or loyalty | Guests use verified phone and code, or the link they received | Verified phone profiles (ADR 019); accounts can be added on top later |
| L-7 | Booking messages by email and WhatsApp only; no SMS | A guest who misses both relies on the on-screen reference | Staff can resend; phone contact |
| L-7a | Guests cannot cancel online; they request cancellation until 24 hours before check-in, and a Manager or Admin decides (Q-38) | A request made at night waits for staff; refunds wait for approval and Paymob | Request queue on the manager overview; messages at each step |
| L-8 | VAT is one rate for all branches, calculated once on the whole booking; no other tax, service charge, or fee is modelled (Q-05, Q-45) | Branches in different tax regimes would need a design change | Client-approved rate and wording before launch |
| L-8a | US dollars only; no currency conversion (Q-46) | Guests calculate other currencies themselves | — |
| L-9 | Revenue figures are recorded prices (excluding VAT), not payments; online payments are reported separately | External reservations without prices are excluded | Reports state this |
| L-10 | English-only booking emails and screens at launch | — | The model allows Arabic later |
| L-11 | Single region, single server (Hostinger VPS) | Outage of the host stops bookings | Website-down procedure; backups |
| L-12 | Forwarded confirmation messages grant access to that reservation (view and cancellation request), and anyone holding the guest's phone can see its reservations | — | Token expiry and rotation; 30-minute guest sessions; requests still need staff approval |
| L-13 | Verification codes are sent by WhatsApp only (Q-28) | Guests without WhatsApp cannot book online | They book by phone with the hotel (staff booking) |
| L-14 | Browsers may block the reminder sound until the receptionist has clicked on the page | The pop-up still opens, but silently | The tab title flashes; staff keep the dashboard open in the foreground |
| L-15 | Sync reminders reach only receptionists who are signed in with the dashboard open | A branch with nobody signed in is not reminded | Overdue checkpoints show on the manager overview and in the history |
| L-16 | Guest data is kept indefinitely (Q-13) | Possible conflict with privacy laws or guest deletion requests | Client to confirm with a legal adviser (RK-14) |
| L-17 | Feedback requests depend on staff recording check-out in Rivana; guest replies stay in the WhatsApp inbox (Q-51) | No feedback request if check-out is not recorded; no feedback reports in Rivana | Check-out is part of the front-desk routine |
| L-18 | The promotion popup (implemented) remains on the current build until M5 removes it | — | Not launched publicly (joint launch, Q-16) |
