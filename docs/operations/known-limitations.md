# Known limitations

Status: living document. Items marked *planned* describe the reservation design (not yet implemented). Existing CMS limitations are in the phase reports, notably [phase-11-release-candidate.md](../delivery/reports/phase-11-release-candidate.md#residual-risks).

## Reservations (planned design)

| # | Limitation | Consequence | Mitigation |
| --- | --- | --- | --- |
| L-1 | **No integration with the hotel's operational system (PMS).** Synchronization is manual. | Rivana cannot guarantee zero overbooking across the two systems. A PMS booking not yet recorded in Rivana is invisible to the website. This is not real-time synchronization. | Request to book; record-external conflict detection; shift reconciliation and checkpoints; manager review; ability to switch online booking off per branch |
| L-2 | Availability shown in search can change before submission | A guest may see "no longer available" at the last step | Re-check under lock at creation, with a clear message |
| L-3 | Room-type counting can accept a stay that no single physical room can hold end to end | A room move may be needed mid-stay | Assignment screen highlights it; staff reassign |
| L-4 | One room per reservation (Q-12) | Families needing two rooms make two reservations | Planned model supports multiple lines later |
| L-5 | No online payment (Q-08) | Payment at the hotel; no deposits; no-show risk | Policy text; staff follow-up |
| L-6 | No password-based customer accounts or loyalty | Guests use verified phone and code, or the link they received | Verified phone profiles (ADR 019); accounts can be added on top later |
| L-7 | Booking messages by email and WhatsApp only; no SMS | A guest who misses both relies on the on-screen reference | Staff can resend; phone contact |
| L-8 | No taxes, fees, or discount codes in pricing (Q-05) | Displayed price is the nightly amount as entered | Client-approved wording |
| L-9 | Revenue figures are recorded prices, not payments | External reservations without prices are excluded | Reports state this |
| L-10 | English-only booking emails and screens at launch | — | The model allows Arabic later |
| L-11 | Single-region, single process group on shared hosting | Outage of the host stops bookings | Website-down procedure; backups |
| L-12 | Forwarded confirmation messages grant access to that reservation, and anyone holding the guest's phone can see its reservations | — | Token expiry and rotation; 30-minute guest sessions |
| L-13 | Verification codes are sent by WhatsApp only (Q-28) | Guests without WhatsApp cannot book online | They book by phone with the hotel (staff booking) |
| L-14 | Browsers may block the reminder sound until the receptionist has clicked on the page | The pop-up still opens, but silently | The tab title flashes; staff keep the dashboard open in the foreground |
| L-15 | Sync reminders reach only receptionists who are signed in with the dashboard open | A branch with nobody signed in is not reminded | Overdue checkpoints show on the manager overview and in the history |
| L-16 | Guest data is kept indefinitely (Q-13) | Possible conflict with privacy laws or guest deletion requests | Client to confirm with a legal adviser (RK-14) |
