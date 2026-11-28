# M10 guest booking journey

M10 is in progress. The owner has accepted twelve of 16 tasks (M10-T11, visual baselines, M10-T5b, the car capacity hint, and M10-T6b, the stay times, were added on 2026-11-27). [Milestone brief](../milestones/m10-guest-booking-journey.md)

## Task log

| Task | Risk | Accepted | Commit | Review file | Gates (counts) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| M10-T0a | Critical | Owner, 2026-11-26 | `feat(analytics): add M10-T0a site event collection` | [Independent review](../../reviews/2026-11-26-m10-t0a.md) | The final `npm run check` passed formatting, lint (one existing warning in `payment-callback.test.ts`), type checking, 2,565 unit and contract tests in 116 files, and the production build. Chromium passed 230 tests with 35 intentional skips. Before the file move, all 1,086 PostgreSQL tests passed in 69 files (339, 302, 445). After the move the shards passed 338, 302 and 445 tests. One existing M9 email migration test timed out in the first shard and passed on its own. All nine focused analytics integration and migration tests passed on the final layout. | P11 records anonymous page and booking step views. Collection defaults to off. The fresh and populated M9 migration checks found no drift. Twenty salt rotation races observed the PostgreSQL lock. Six server markers were absent from all 37 browser chunks. The reviewer verified all three major and two minor fixes, then approved the final file layout. At the acceptance commit, `npm run check` passed again (2,565 tests in 116 files, same lint warning), and 23 PostgreSQL tests in the four analytics, seed and migration files passed. The browser suite and the full PostgreSQL suite were not repeated. |
| M10-T0b | Critical | Owner, 2026-11-26 | `feat(analytics): add M10-T0b server funnel steps and daily totals` | [Independent review](../../reviews/2026-11-26-m10-t0b.md) | `npm run check` passed formatting, lint (one existing warning in `payment-callback.test.ts`), type checking, 2,575 unit and contract tests in 117 files, and the production build. PostgreSQL passed 1,121 tests in 71 files (364, 315, 442). Isolated 20 round runs passed 14 inventory, 17 booking and payment, and 2 analytics races. Chromium passed 232 with 35 intentional skips. | Server side booking steps, the online booking link, daily totals and 90 day deletion; no migration. Claude Opus 5.5 approved with nits (3 minor, 8 nits), each fixed or answered. A development server run stored all eight expected events with no cookie and no personal data. The browser suite cannot complete a booking because its server refuses fake providers. Acceptance took both recommendations: a resent refused booking counts again, and the journey E2E setup is decided at M10-T4 planning. At the acceptance commit, `npm run check` passed again (2,575 tests in 117 files, same lint warning), and 44 PostgreSQL tests in the four analytics files passed. The browser suite and the full PostgreSQL suite were not repeated. |
| M10-T1 | Medium (the added pricing fix reviewed as critical) | Owner, 2026-11-26 | `feat(booking): add M10-T1 typed API client` | [Independent review](../../reviews/2026-11-26-m10-t1.md) | `npm run check` passed formatting, lint (one existing warning in `payment-callback.test.ts`), type checking, 2,741 unit and contract tests in 122 files, and the production build. PostgreSQL passed 1,126 tests in 71 files (364, 315, 447). Chromium passed 232 with 35 intentional skips. One earlier Chromium run failed once on the admin media editor accessibility check (a page read without a title, code not changed here); the full rerun passed. | Typed browser client for P5 to P7, P9 to P11 and G1 to G6, the visit id helper, a money formatter, and `branch.timeZone` on G1, G4 and G6; no screen uses the client yet and no migration. Claude Opus 5.5 asked for changes (1 major: search values lost on Safari 16.4; 1 minor; 7 nits), then approved with nits after the fixes. The live run found that seasonal rates made staff creation, staff changes, guest changes and paid approvals fail with `422` (present since M8 and M9). The owner added the fix to this task; five new PostgreSQL tests cover it, and the reviewer approved it with its one minor finding then fixed. The live run was not repeated after the fixes. |
| M10-T2 | Medium | Owner, 2026-11-26 | `feat(booking): add M10-T2 branch availability search` | [Independent review](../../reviews/2026-11-26-m10-t2.md) | Before acceptance: `npm run check` passed formatting, lint (one existing warning in `payment-callback.test.ts`), type checking, 2,755 unit and contract tests in 125 files, and the production build. PostgreSQL passed 1,128 tests in 71 files (366, 315, 447) before the review fixes, and 76 tests in the three affected files after them. Chromium passed 236 with 41 intentional skips. The focused booking search run (`BOOKING_SEARCH_E2E=1 CROSS_BROWSER=1`, Chromium and WebKit) passed 20 with 5 intentional skips. At the acceptance commit, `npm run check` passed again (2,755 tests in 125 files, same lint warning), and 112 PostgreSQL tests in the analytics funnel, public availability, payment jobs and seed files passed. The browser suite and the full PostgreSQL suite were not repeated. | The public `/{branch}/book` search page: a form that works without JavaScript, exact nightly prices and stay totals before VAT, reasons for unavailable listings, the hotel contact panel when online booking is off, and session-less unmet demand analytics. No endpoint, schema, port, or dependency change. Claude Opus 5.5 approved with nits (5 minor, 5 nits), each fixed or answered, and a separate recheck found nothing unresolved. In a production build at 320 px the form and results had no axe violations, no overflow, and 248,102 encoded script bytes against the 260 KB budget ([measurements](./m10-t2-verification.json)). Firefox and a full Lighthouse run were not part of this gate. At acceptance the owner added the [screenshot and preview link rule](../../engineering/agent-workflow.md#screenshots-and-preview-links-ui-tasks) for UI tasks. |
| M10-T3 | Medium | Owner, 2026-11-27 | `feat(booking): add M10-T3 selection basket` | [Independent review](../../reviews/2026-11-27-m10-t3.md) | `npm run check` passed format, lint (one existing warning in `payment-callback.test.ts`), type checking, 2,756 unit and contract tests in 126 files, and the production build. `npm run test:integration -- --shard=N/3 --reporter=dot --silent=true` passed 1,129 PostgreSQL tests in 71 files (367, 315, and 447 tests). The focused seed run passed 13 tests. `npm run test:e2e -- --reporter=dot --workers=5` passed 236 Chromium tests with 45 intentional skips. The same command with `BOOKING_SEARCH_E2E=1 CROSS_BROWSER=1` passed 30 in Chromium and WebKit with 5 intentional skips. | Guests can mix rooms and apartments for one stay, choose up to five units, and edit the guest counts per unit. The basket shows the accommodation subtotal from P6 before VAT and keeps the selection when a quote fails. The live room and apartment selection showed $420.00 and prepared the agreed details URL. Continue goes live in T4. GPT-6.2 Astra approved with zero open findings after the card feedback, quantity refusal, and accessible validation fixes. The first WebKit run found short guest controls. The final runs verified 44 px controls, zero axe violations, no overflow at 320 px, and 250,321 encoded script bytes. [Desktop and mobile screenshots](#m10-t3-booking-selection-accepted-2026-11-27). |
| M10-T4 | Critical | Owner, 2026-11-27 | `feat(booking): add M10-T4 details page and verification` | [Independent review](../../reviews/2026-11-27-m10-t4.md) | `npm run check` passed format, lint (one existing warning in `payment-callback.test.ts`), type checking, 2,902 unit and contract tests in 132 files, and the production build, and passed again at the acceptance commit. `npm run test:integration -- --shard=N/3` passed 1,133 PostgreSQL tests in 72 files (367, 315, and 451); after one later test edit only that file was rerun (4 passed). `npm run test:e2e` passed 238 Chromium tests with 55 intentional skips. The search run (`BOOKING_SEARCH_E2E=1 CROSS_BROWSER=1`) passed 35 with 10 skips, and the journey run (`BOOKING_JOURNEY_E2E=1 CROSS_BROWSER=1`) passed 20, in Chromium and WebKit. The browser suites and the full PostgreSQL suite were not repeated at the commit. Firefox, Lighthouse, the isolated concurrency run and the migration check were not run (no locking or schema change). | The `/{branch}/book/details` page: server setup and price, guest details, WhatsApp or email verification, and a tab draft; Continue is live and the basket rebuilds from the address. No API, schema, port or dependency change. Claude Opus 5.5 approved with nits (3 minor, 7 nits), then approved the recheck after all minors and five nits were fixed; two document nits are synced here. One optional recheck note (the log check now reaches error objects) was fixed afterwards without a further review; three stay open. First load scripts are 253,415 compressed bytes on the details page and 253,807 on results (259,207 with headers) against 260,000; after step 1 the details page reaches 300,832 as the phone library and step 2 load on demand. One standard browser run failed once on a public photo viewer test ("browser has been closed", code not changed here); the full rerun passed. [Desktop and mobile screenshots](#m10-t4-details-and-verification-accepted-2026-11-27). |
| M10-T5 | Medium | Owner, 2026-11-27 | `feat(booking): add M10-T5 extras and coupon` | [Independent review](../../reviews/2026-11-27-m10-t5.md) | `npm run check` passed format, lint (one existing warning in `payment-callback.test.ts`), type checking, 2,968 unit and contract tests in 136 files, and the production build, and passed again at the acceptance commit. `npm run test:integration -- --shard=N/3` passed 1,133 PostgreSQL tests in 72 files (367, 315, and 451), run before the review fixes, which changed no server code. `npm run test:e2e` passed 238 Chromium tests with 61 intentional skips. `BOOKING_SEARCH_E2E=1 CROSS_BROWSER=1` passed 35 with 10 skips and `BOOKING_JOURNEY_E2E=1 CROSS_BROWSER=1` passed 35, both in Chromium and WebKit. | Step 3: extras, transfer cars and flight details, one coupon, and the server price panel. Screen code only: no server, schema, contract, or port change. Claude Opus 5.5 approved the recheck. Testing found that a service refusal naming a service that was not asked for would have left the price check waiting; fixed. Lighthouse puts the booking pages above the 260,000 byte script budget, before and after this task. Not run: Firefox, the full Lighthouse suite, and visual baselines (M10-T11, added at planning). Owner agreed after acceptance (2026-11-27): M10-T10 fixes the budget, M10-T6 the panel wording after a sold out or closed answer, and the `persistence-boundaries.test.ts` pattern is narrowed in a small separate change, approved before it is made. Two optional review points stay open. |
| M10-T5b | Low | Owner, 2026-11-27 | `feat(booking): add M10-T5b transfer car capacity hint` | [Independent review](../../reviews/2026-11-27-m10-t5b.md) | `npm run check` passed, including the production build, after one older test expectation was updated. Format, lint (one existing warning in `payment-callback.test.ts`), type checking and 3,018 unit and contract tests in 137 files passed again after the review fixes. `npm run test:e2e` passed 238 Chromium tests with 77 intentional skips. `BOOKING_JOURNEY_E2E=1 CROSS_BROWSER=1` passed 75 in Chromium and WebKit, before and after the review fixes. Integration tests were not run (no server code changed). | A line under the Cars selector says how many people the chosen cars take (2 per car, Q-101). It blocks and reprices nothing |
| M10-T6 | Critical | Owner, 2026-11-27 | `feat(booking): add M10-T6 payment, review and confirmation` | [Independent review](../../reviews/2026-11-27-m10-t6.md) | `npm run check` passed format, lint (one existing warning in `payment-callback.test.ts`), type checking, 3,014 unit and contract tests in 137 files, and the production build, and passed again at the acceptance commit. `npm run test:integration -- --shard=N/3` passed 1,133 PostgreSQL tests in 72 files (367, 315, and 451), run before the review fixes, which changed no server code. `npm run test:e2e` passed 238 Chromium tests with 77 intentional skips; one earlier run of the final code failed once on the branch websites test "staff REST writes succeed and immediately refresh public branch data" (code not changed here), and the full rerun passed. `BOOKING_SEARCH_E2E=1 CROSS_BROWSER=1` passed 35 with 10 skips. `BOOKING_JOURNEY_E2E=1 CROSS_BROWSER=1` passed 75 in Chromium and WebKit three times in a row, after one WebKit failure caused by one use test mocks (fixed in the test). Six server markers were absent from all 42 browser chunks. `npm run audit:content` reports the new placeholder wording as launch blockers, as intended (7 of 16 checks pass). Firefox, Lighthouse, the isolated concurrency run and the migration check were not run (no locking or schema change). | Steps 4 and 5 (payment choice, review, consent, submit with one key across retries) and `/{branch}/book/confirmed`. No API, schema, port or dependency change. Built with Codex, which stopped at its usage limit as the review began; Claude finished it, restyled the checkout and confirmation screens, and moved price figures to the body face. Claude Opus 5.5 asked for changes (1 major: untested submit answers; 7 minor; 7 nits), then approved with nits after two rechecks. At acceptance the owner took both recommendations: a warning before the page is left while a result is unknown (built and reviewed after acceptance), and the new price font on earlier screens. One optional nit from the last recheck stays open (the leave listener is attached for the whole checkout), with the nits listed in [spec 0007](../../specs/0007-m10-guest-booking-journey.md#settled-during-m10-t6-2026-11-27). [Desktop and mobile screenshots](#m10-t6-payment-review-and-confirmation-accepted-2026-11-27). |
| M10-T6b | Medium | Owner, 2026-11-27 | `feat(booking): add M10-T6b check-in and check-out times` | [Independent review](../../reviews/2026-11-27-m10-t6b.md) | On the final code `npm run check` passed format, lint (one existing warning in `payment-callback.test.ts`), type checking, 3,040 unit and contract tests in 138 files, and the production build. `npm run test:integration -- --shard=N/3` passed 1,140 PostgreSQL tests in 72 files (373, 315, and 452). `prisma migrate diff` showed no difference after a fresh and a populated upgrade (2 branches and 25 bookings, existing branch times unchanged). `npm run test:e2e` passed 238 Chromium tests with 77 intentional skips. The booking journey run passed 75 and the search run 35 with 10 skips, in Chromium and WebKit. | Optional latest check-in and earliest check-out per branch (Q-102), shown with each stay date on the booking and confirmation pages. Review fixes: a new version for the cached branch list, and stacked dates in the stay panel. Open: screen reader wording of the time range |
| M10-T7 | Critical | Owner, 2026-11-28 | `feat(booking): add M10-T7 payment return` | [Independent review](../../reviews/2026-11-28-m10-t7.md) | `npm run check` passed formatting, lint with one existing warning in `payment-callback.test.ts`, type checking, 3,056 unit and contract tests in 139 files, and the production build. `npm run test:integration -- --shard=N/3 --reporter=dot --silent=true` passed 1,140 tests in 72 files (373, 315, and 452). `npm run test:e2e -- --reporter=dot` passed 238 tests with 85 intentional skips. The focused fake checkout command below passed 25 tests across Chromium and WebKit. Six server markers were absent from all 43 browser chunks. | Verified confirmed, waiting, and failed payment states in the live app. Browser tests proved that closing checkout or running the hold expiry job releases the unit. GPT-6 Astra approved with zero findings after Claude CLI could not connect. An acceptance run failed once in the existing WhatsApp form test. All 12 tests in that file and the full `npm run check` rerun passed. The first browser run needed the pinned browser binaries. The passing focused run logged one development mode `Connection closed` diagnostic. Firefox and Lighthouse were outside this run. The My reservations recovery link is planned for T8. [Screenshots and focused command](#m10-t7-payment-return-accepted-2026-11-28) |
| M10-T8 | Critical | Owner, 2026-11-28 | `feat(booking): add M10-T8 manage booking and My reservations` | [Independent review](../../reviews/2026-11-28-m10-t8.md) | `npm run check` passed formatting, lint with one existing warning, type checking, 3,130 unit and contract tests in 142 files, and the production build. PostgreSQL passed 1,140 tests in 72 files across three shards, run before the review fixes, which changed no server code. Standard Chromium passed 246 tests with 93 intentional skips. The search run passed 35 with 10 skips and the journey run 130 with 5 skips, both in Chromium and WebKit. Six server only names were absent from all 51 browser files. `npm run check` passed again at the acceptance commit. Firefox, Lighthouse, the isolated concurrency run, the migration check and a separate `/check verify` pass were not run (no locking or schema change). | The manage page and My reservations with cancellation requests. No API, schema, port or dependency change. Claude Opus 5.5 approved with nits (3 minor, 5 nits), asked for changes at the recheck (1 major: a late wording change broke unit tests), then approved with nits. One nit stays open (a lazy step that fails to download needs a reload). The footer link needed one allowed address in an older public site test. Owner accepted on 2026-11-28; sign out removing every key stays. Adding the two pages to the M10-T10 script budget work was recommended and is not yet confirmed. [Desktop and mobile screenshots](#m10-t8-manage-booking-and-my-reservations-accepted-2026-11-28) |

## Screenshots

Captured from a local development server with demo data, at 1280 px (desktop) and 390 px (mobile) widths. The hotel contact screen shows the New Cairo branch's seeded contact details.

### M10-T2 branch booking search (accepted 2026-11-26)

| Screen | Desktop | Mobile |
| --- | --- | --- |
| Search form | [Desktop](screenshots/m10/m10-t2/search-form-desktop.png) | [Mobile](screenshots/m10/m10-t2/search-form-mobile.png) |
| Available stays | [Desktop](screenshots/m10/m10-t2/available-stays-desktop.png) | [Mobile](screenshots/m10/m10-t2/available-stays-mobile.png) |
| Nightly prices, selected listing | [Desktop](screenshots/m10/m10-t2/nightly-prices-desktop.png) | [Mobile](screenshots/m10/m10-t2/nightly-prices-mobile.png) |
| No availability | [Desktop](screenshots/m10/m10-t2/no-availability-desktop.png) | [Mobile](screenshots/m10/m10-t2/no-availability-mobile.png) |
| Check-out date error | [Desktop](screenshots/m10/m10-t2/invalid-checkout-desktop.png) | [Mobile](screenshots/m10/m10-t2/invalid-checkout-mobile.png) |
| Too many searches | [Desktop](screenshots/m10/m10-t2/too-many-searches-desktop.png) | [Mobile](screenshots/m10/m10-t2/too-many-searches-mobile.png) |
| Search could not run | [Desktop](screenshots/m10/m10-t2/search-failed-desktop.png) | [Mobile](screenshots/m10/m10-t2/search-failed-mobile.png) |
| Online booking off, hotel contact | [Desktop](screenshots/m10/m10-t2/hotel-contact-desktop.png) | [Mobile](screenshots/m10/m10-t2/hotel-contact-mobile.png) |

### M10-T3 booking selection (accepted 2026-11-27)

Captured at 1280 and 390 px using a local production build and a separate PostgreSQL database with fictional listings. The room and apartment subtotal of $420.00 came from the live quote API. Browser test responses reproduced the temporary errors. The results page loaded 250,321 encoded script bytes, below the 260 KB budget. The selected state passed 49 axe rules with zero violations and fit at 320 px with 44 px guest controls.

| State | Desktop | Mobile |
| --- | --- | --- |
| Empty selection | [Desktop](screenshots/m10/m10-t3/empty-selection-desktop.png) | [Mobile](screenshots/m10/m10-t3/empty-selection-mobile.png) |
| Checking the price | [Desktop](screenshots/m10/m10-t3/checking-price-desktop.png) | [Mobile](screenshots/m10/m10-t3/checking-price-mobile.png) |
| Room and apartment selected | [Desktop](screenshots/m10/m10-t3/mixed-selection-desktop.png) | [Mobile](screenshots/m10/m10-t3/mixed-selection-mobile.png) |
| Five units selected | [Desktop](screenshots/m10/m10-t3/selection-limit-desktop.png) | [Mobile](screenshots/m10/m10-t3/selection-limit-mobile.png) |
| Availability changed | [Desktop](screenshots/m10/m10-t3/availability-changed-desktop.png) | [Mobile](screenshots/m10/m10-t3/availability-changed-mobile.png) |
| Quote connection failed | [Desktop](screenshots/m10/m10-t3/quote-error-desktop.png) | [Mobile](screenshots/m10/m10-t3/quote-error-mobile.png) |
| Too many quote checks | [Desktop](screenshots/m10/m10-t3/quote-rate-limited-desktop.png) | [Mobile](screenshots/m10/m10-t3/quote-rate-limited-mobile.png) |
| Quote validation error | [Desktop](screenshots/m10/m10-t3/quote-validation-desktop.png) | [Mobile](screenshots/m10/m10-t3/quote-validation-mobile.png) |
| Online booking switched off during selection | [Desktop](screenshots/m10/m10-t3/quote-booking-off-desktop.png) | [Mobile](screenshots/m10/m10-t3/quote-booking-off-mobile.png) |

### M10-T4 details and verification (accepted 2026-11-27)

Captured at 1280 and 390 px from a local development server with fake providers, fictional guests and a disposable database. The development badge is hidden.

| State | Desktop | Mobile |
| --- | --- | --- |
| Basket with a live Continue | [Desktop](screenshots/m10/m10-t4/results-continue-desktop.png) | [Mobile](screenshots/m10/m10-t4/results-continue-mobile.png) |
| Sent back: selection unavailable | [Desktop](screenshots/m10/m10-t4/results-selection-unavailable-desktop.png) | [Mobile](screenshots/m10/m10-t4/results-selection-unavailable-mobile.png) |
| Sent back: selection unreadable | [Desktop](screenshots/m10/m10-t4/results-selection-unreadable-desktop.png) | [Mobile](screenshots/m10/m10-t4/results-selection-unreadable-mobile.png) |
| Details form | [Desktop](screenshots/m10/m10-t4/details-form-desktop.png) | [Mobile](screenshots/m10/m10-t4/details-form-mobile.png) |
| Details errors | [Desktop](screenshots/m10/m10-t4/details-errors-desktop.png) | [Mobile](screenshots/m10/m10-t4/details-errors-mobile.png) |
| Too many price checks | [Desktop](screenshots/m10/m10-t4/details-too-many-checks-desktop.png) | [Mobile](screenshots/m10/m10-t4/details-too-many-checks-mobile.png) |
| Booking off, hotel contact | [Desktop](screenshots/m10/m10-t4/details-hotel-contact-desktop.png) | [Mobile](screenshots/m10/m10-t4/details-hotel-contact-mobile.png) |
| Choose a channel | [Desktop](screenshots/m10/m10-t4/verify-choose-channel-desktop.png) | [Mobile](screenshots/m10/m10-t4/verify-choose-channel-mobile.png) |
| Email chosen | [Desktop](screenshots/m10/m10-t4/verify-email-choice-desktop.png) | [Mobile](screenshots/m10/m10-t4/verify-email-choice-mobile.png) |
| Enter the code | [Desktop](screenshots/m10/m10-t4/verify-enter-code-desktop.png) | [Mobile](screenshots/m10/m10-t4/verify-enter-code-mobile.png) |
| Wrong code | [Desktop](screenshots/m10/m10-t4/verify-wrong-code-desktop.png) | [Mobile](screenshots/m10/m10-t4/verify-wrong-code-mobile.png) |
| Code expired | [Desktop](screenshots/m10/m10-t4/verify-code-expired-desktop.png) | [Mobile](screenshots/m10/m10-t4/verify-code-expired-mobile.png) |
| Resend wait | [Desktop](screenshots/m10/m10-t4/verify-resend-wait-desktop.png) | [Mobile](screenshots/m10/m10-t4/verify-resend-wait-mobile.png) |
| Send failed | [Desktop](screenshots/m10/m10-t4/verify-send-failed-desktop.png) | [Mobile](screenshots/m10/m10-t4/verify-send-failed-mobile.png) |
| Phone verified | [Desktop](screenshots/m10/m10-t4/verify-phone-verified-desktop.png) | [Mobile](screenshots/m10/m10-t4/verify-phone-verified-mobile.png) |
| Email verified | [Desktop](screenshots/m10/m10-t4/verify-email-verified-desktop.png) | [Mobile](screenshots/m10/m10-t4/verify-email-verified-mobile.png) |
| Blocked number | [Desktop](screenshots/m10/m10-t4/verify-blocked-desktop.png) | [Mobile](screenshots/m10/m10-t4/verify-blocked-mobile.png) |

### M10-T5 extras and coupon (accepted 2026-11-27)

Captured at 1280 and 390 px from a local development server with fake providers, fictional guests, extras and coupons, and a disposable database. The development badge is hidden. The connection failure, too many checks, switched off service and sold out answers were supplied by the browser test; the other states are live server answers.

| State | Desktop | Mobile |
| --- | --- | --- |
| Nothing selected | [Desktop](screenshots/m10/m10-t5/extras-nothing-selected-desktop.png) | [Mobile](screenshots/m10/m10-t5/extras-nothing-selected-mobile.png) |
| Breakfast, transfer with 2 cars (per car price), flight details | [Desktop](screenshots/m10/m10-t5/extras-selected-desktop.png) | [Mobile](screenshots/m10/m10-t5/extras-selected-mobile.png) |
| Checking the price | [Desktop](screenshots/m10/m10-t5/price-updating-desktop.png) | [Mobile](screenshots/m10/m10-t5/price-updating-mobile.png) |
| Coupon applied | [Desktop](screenshots/m10/m10-t5/coupon-applied-desktop.png) | [Mobile](screenshots/m10/m10-t5/coupon-applied-mobile.png) |
| Coupon refused, earlier code kept | [Desktop](screenshots/m10/m10-t5/coupon-refused-desktop.png) | [Mobile](screenshots/m10/m10-t5/coupon-refused-mobile.png) |
| Service switched off and removed | [Desktop](screenshots/m10/m10-t5/service-removed-desktop.png) | [Mobile](screenshots/m10/m10-t5/service-removed-mobile.png) |
| Too many price checks | [Desktop](screenshots/m10/m10-t5/price-too-many-checks-desktop.png) | [Mobile](screenshots/m10/m10-t5/price-too-many-checks-mobile.png) |
| Price check failed | [Desktop](screenshots/m10/m10-t5/price-connection-failed-desktop.png) | [Mobile](screenshots/m10/m10-t5/price-connection-failed-mobile.png) |
| Selection no longer available | [Desktop](screenshots/m10/m10-t5/selection-unavailable-desktop.png) | [Mobile](screenshots/m10/m10-t5/selection-unavailable-mobile.png) |
| Email guest, total cannot be paid online | [Desktop](screenshots/m10/m10-t5/email-total-not-payable-desktop.png) | [Mobile](screenshots/m10/m10-t5/email-total-not-payable-mobile.png) |

### M10-T5b transfer car capacity hint (accepted 2026-11-27)

Captured at 1280 and 390 px by the booking journey test on the development server with fake providers and a disposable database. The files are copies of the test states `extras-one-car` and `extras-selected`.

| State | Desktop | Mobile |
| --- | --- | --- |
| One car | [Desktop](screenshots/m10/m10-t5b/one-car-desktop.png) | [Mobile](screenshots/m10/m10-t5b/one-car-mobile.png) |
| Two cars | [Desktop](screenshots/m10/m10-t5b/two-cars-desktop.png) | [Mobile](screenshots/m10/m10-t5b/two-cars-mobile.png) |

### M10-T6 payment, review and confirmation (accepted 2026-11-27)

Full pages from the working tree at 1280 and 390 px. Guests, bookings and contact details are fictional. The two-unit booking, lost reply after a real save, last-unit conflict and price change use the development server and disposable PostgreSQL. The test supplies the changed method, rate limit, closed branch, failed read, unavailable checkout and failed payment answers to show their messages.

| State | Desktop | Mobile |
| --- | --- | --- |
| Payment choices, both available | [Desktop](screenshots/m10/m10-t6/checkout-payment-desktop.png) | [Mobile](screenshots/m10/m10-t6/checkout-payment-mobile.png) |
| Payment after email verification | [Desktop](screenshots/m10/m10-t6/checkout-email-payment-desktop.png) | [Mobile](screenshots/m10/m10-t6/checkout-email-payment-mobile.png) |
| Payment choices need another look | [Desktop](screenshots/m10/m10-t6/checkout-method-changed-desktop.png) | [Mobile](screenshots/m10/m10-t6/checkout-method-changed-mobile.png) |
| Review with two units, extras, coupon, VAT and consent | [Desktop](screenshots/m10/m10-t6/checkout-review-desktop.png) | [Mobile](screenshots/m10/m10-t6/checkout-review-mobile.png) |
| Review after email verification | [Desktop](screenshots/m10/m10-t6/checkout-email-review-desktop.png) | [Mobile](screenshots/m10/m10-t6/checkout-email-review-mobile.png) |
| Confirmed pay at hotel booking | [Desktop](screenshots/m10/m10-t6/checkout-confirmed-desktop.png) | [Mobile](screenshots/m10/m10-t6/checkout-confirmed-mobile.png) |
| Back to results after the units sell out | [Desktop](screenshots/m10/m10-t6/checkout-sold-out-desktop.png) | [Mobile](screenshots/m10/m10-t6/checkout-sold-out-mobile.png) |
| Fresh quote awaiting acceptance | [Desktop](screenshots/m10/m10-t6/checkout-price-changed-desktop.png) | [Mobile](screenshots/m10/m10-t6/checkout-price-changed-mobile.png) |
| First reply lost, same booking can be retried | [Desktop](screenshots/m10/m10-t6/checkout-retry-desktop.png) | [Mobile](screenshots/m10/m10-t6/checkout-retry-mobile.png) |
| Booking already saved, reference recovered | [Desktop](screenshots/m10/m10-t6/checkout-reference-desktop.png) | [Mobile](screenshots/m10/m10-t6/checkout-reference-mobile.png) |
| Booking closed during review | [Desktop](screenshots/m10/m10-t6/checkout-closed-desktop.png) | [Mobile](screenshots/m10/m10-t6/checkout-closed-mobile.png) |
| Checkout could not open | [Desktop](screenshots/m10/m10-t6/checkout-unavailable-desktop.png) | [Mobile](screenshots/m10/m10-t6/checkout-unavailable-mobile.png) |
| Retry reports a failed payment | [Desktop](screenshots/m10/m10-t6/checkout-payment-failed-desktop.png) | [Mobile](screenshots/m10/m10-t6/checkout-payment-failed-mobile.png) |
| Too many submissions | [Desktop](screenshots/m10/m10-t6/checkout-rate-limited-desktop.png) | [Mobile](screenshots/m10/m10-t6/checkout-rate-limited-mobile.png) |
| No usable private link in this tab | [Desktop](screenshots/m10/m10-t6/checkout-missing-link-desktop.png) | [Mobile](screenshots/m10/m10-t6/checkout-missing-link-mobile.png) |
| Current reservation details could not be loaded | [Desktop](screenshots/m10/m10-t6/checkout-read-failed-desktop.png) | [Mobile](screenshots/m10/m10-t6/checkout-read-failed-mobile.png) |

### M10-T6b check-in and check-out times (accepted 2026-11-27)

Captured at 1280 and 390 px with fictional guests, stay times and disposable databases. The guest screens come from the booking journey test; the admin screens show the Stay times group on a local preview server.

| State | Desktop | Mobile |
| --- | --- | --- |
| Details step | [Desktop](screenshots/m10/m10-t6b/details-desktop.png) | [Mobile](screenshots/m10/m10-t6b/details-mobile.png) |
| Review | [Desktop](screenshots/m10/m10-t6b/review-desktop.png) | [Mobile](screenshots/m10/m10-t6b/review-mobile.png) |
| Confirmation | [Desktop](screenshots/m10/m10-t6b/confirmed-desktop.png) | [Mobile](screenshots/m10/m10-t6b/confirmed-mobile.png) |
| Admin stay times | [Desktop](screenshots/m10/m10-t6b/admin-times-desktop.png) | [Mobile](screenshots/m10/m10-t6b/admin-times-mobile.png) |
| Admin refusal of a wrong window | [Desktop](screenshots/m10/m10-t6b/admin-times-refused-desktop.png) | [Mobile](screenshots/m10/m10-t6b/admin-times-refused-mobile.png) |

### M10-T7 payment return (accepted 2026-11-28)

These full page screenshots use fictional bookings and contact details. The focused run used a disposable PostgreSQL database, fake providers, and the development server.

```sh
BOOKING_JOURNEY_E2E=1 CROSS_BROWSER=1 E2E_DATABASE_URL="$E2E_DATABASE_URL" \
  npm run test:e2e -- --grep 'E2E-G-3|payment return' --no-deps --workers=5 --reporter=dot
```

| State | Desktop, 1280 px | Mobile, 390 px |
| --- | --- | --- |
| Checking booking status | [Desktop](screenshots/m10/m10-t7/payment-return-checking-desktop.png) | [Mobile](screenshots/m10/m10-t7/payment-return-checking-mobile.png) |
| Confirmed with receipt | [Desktop](screenshots/m10/m10-t7/payment-return-confirmed-desktop.png) | [Mobile](screenshots/m10/m10-t7/payment-return-confirmed-mobile.png) |
| Payment not completed | [Desktop](screenshots/m10/m10-t7/payment-return-failed-desktop.png) | [Mobile](screenshots/m10/m10-t7/payment-return-failed-mobile.png) |
| Still waiting after two minutes | [Desktop](screenshots/m10/m10-t7/payment-return-waiting-desktop.png) | [Mobile](screenshots/m10/m10-t7/payment-return-waiting-mobile.png) |
| Missing or expired access | [Desktop](screenshots/m10/m10-t7/payment-return-no-access-desktop.png) | [Mobile](screenshots/m10/m10-t7/payment-return-no-access-mobile.png) |
| Temporary check error | [Desktop](screenshots/m10/m10-t7/payment-return-check-error-desktop.png) | [Mobile](screenshots/m10/m10-t7/payment-return-check-error-mobile.png) |
| Server asks the guest to wait before retrying | [Desktop](screenshots/m10/m10-t7/payment-return-rate-limited-desktop.png) | [Mobile](screenshots/m10/m10-t7/payment-return-rate-limited-mobile.png) |
| Other current reservation status | [Desktop](screenshots/m10/m10-t7/payment-return-other-status-desktop.png) | [Mobile](screenshots/m10/m10-t7/payment-return-other-status-mobile.png) |
| JavaScript off | [Desktop](screenshots/m10/m10-t7/payment-return-no-javascript-desktop.png) | [Mobile](screenshots/m10/m10-t7/payment-return-no-javascript-mobile.png) |

### M10-T8 manage booking and My reservations (accepted 2026-11-28)

Captured at 1280 and 390 px with fictional guests and a disposable database. Journey states come from the development server with fake providers; "No code can be sent" comes from the production build. The request decisions, refund, change request, load failure, lost reply, blocked number and ended access answers were supplied by the browser test.

| State | Desktop | Mobile |
| --- | --- | --- |
| Confirmed booking | [Desktop](screenshots/m10/m10-t8/manage-confirmed-desktop.png) | [Mobile](screenshots/m10/m10-t8/manage-confirmed-mobile.png) |
| Request cancellation form | [Desktop](screenshots/m10/m10-t8/manage-cancel-form-desktop.png) | [Mobile](screenshots/m10/m10-t8/manage-cancel-form-mobile.png) |
| Request sent, waiting for the hotel | [Desktop](screenshots/m10/m10-t8/manage-request-open-desktop.png) | [Mobile](screenshots/m10/m10-t8/manage-request-open-mobile.png) |
| Request declined | [Desktop](screenshots/m10/m10-t8/manage-request-rejected-desktop.png) | [Mobile](screenshots/m10/m10-t8/manage-request-rejected-mobile.png) |
| Approved, refund requested | [Desktop](screenshots/m10/m10-t8/manage-refund-pending-desktop.png) | [Mobile](screenshots/m10/m10-t8/manage-refund-pending-mobile.png) |
| Refund not gone through | [Desktop](screenshots/m10/m10-t8/manage-refund-failed-desktop.png) | [Mobile](screenshots/m10/m10-t8/manage-refund-failed-mobile.png) |
| Cancellation completed | [Desktop](screenshots/m10/m10-t8/manage-cancelled-desktop.png) | [Mobile](screenshots/m10/m10-t8/manage-cancelled-mobile.png) |
| Change waiting for the hotel | [Desktop](screenshots/m10/m10-t8/manage-change-open-desktop.png) | [Mobile](screenshots/m10/m10-t8/manage-change-open-mobile.png) |
| Deadline passed | [Desktop](screenshots/m10/m10-t8/manage-deadline-passed-desktop.png) | [Mobile](screenshots/m10/m10-t8/manage-deadline-passed-mobile.png) |
| Booking could not be loaded | [Desktop](screenshots/m10/m10-t8/manage-load-failed-desktop.png) | [Mobile](screenshots/m10/m10-t8/manage-load-failed-mobile.png) |
| Reply to a request was lost | [Desktop](screenshots/m10/m10-t8/manage-lost-reply-desktop.png) | [Mobile](screenshots/m10/m10-t8/manage-lost-reply-mobile.png) |
| Missing or broken link | [Desktop](screenshots/m10/m10-t8/manage-unusable-link-desktop.png) | [Mobile](screenshots/m10/m10-t8/manage-unusable-link-mobile.png) |
| Manage page, JavaScript off | [Desktop](screenshots/m10/m10-t8/manage-no-javascript-desktop.png) | [Mobile](screenshots/m10/m10-t8/manage-no-javascript-mobile.png) |
| My reservations form | [Desktop](screenshots/m10/m10-t8/find-form-desktop.png) | [Mobile](screenshots/m10/m10-t8/find-form-mobile.png) |
| Form errors | [Desktop](screenshots/m10/m10-t8/find-form-errors-desktop.png) | [Mobile](screenshots/m10/m10-t8/find-form-errors-mobile.png) |
| Email code chosen | [Desktop](screenshots/m10/m10-t8/find-email-form-desktop.png) | [Mobile](screenshots/m10/m10-t8/find-email-form-mobile.png) |
| Send the code | [Desktop](screenshots/m10/m10-t8/find-send-code-desktop.png) | [Mobile](screenshots/m10/m10-t8/find-send-code-mobile.png) |
| Wrong code | [Desktop](screenshots/m10/m10-t8/find-wrong-code-desktop.png) | [Mobile](screenshots/m10/m10-t8/find-wrong-code-mobile.png) |
| List of bookings | [Desktop](screenshots/m10/m10-t8/find-list-desktop.png) | [Mobile](screenshots/m10/m10-t8/find-list-mobile.png) |
| Empty list | [Desktop](screenshots/m10/m10-t8/find-empty-list-desktop.png) | [Mobile](screenshots/m10/m10-t8/find-empty-list-mobile.png) |
| One booking | [Desktop](screenshots/m10/m10-t8/find-booking-desktop.png) | [Mobile](screenshots/m10/m10-t8/find-booking-mobile.png) |
| Request sent from My reservations | [Desktop](screenshots/m10/m10-t8/find-booking-request-open-desktop.png) | [Mobile](screenshots/m10/m10-t8/find-booking-request-open-mobile.png) |
| Signed out | [Desktop](screenshots/m10/m10-t8/find-signed-out-desktop.png) | [Mobile](screenshots/m10/m10-t8/find-signed-out-mobile.png) |
| Access ended | [Desktop](screenshots/m10/m10-t8/find-access-ended-desktop.png) | [Mobile](screenshots/m10/m10-t8/find-access-ended-mobile.png) |
| Contact the hotel (blocked number) | [Desktop](screenshots/m10/m10-t8/find-contact-hotel-desktop.png) | [Mobile](screenshots/m10/m10-t8/find-contact-hotel-mobile.png) |
| No code can be sent | [Desktop](screenshots/m10/m10-t8/find-codes-unavailable-desktop.png) | [Mobile](screenshots/m10/m10-t8/find-codes-unavailable-mobile.png) |
| My reservations, JavaScript off | [Desktop](screenshots/m10/m10-t8/find-no-javascript-desktop.png) | [Mobile](screenshots/m10/m10-t8/find-no-javascript-mobile.png) |
| Payment return without access, new link | [Desktop](screenshots/m10/m10-t8/payment-return-no-access-desktop.png) | [Mobile](screenshots/m10/m10-t8/payment-return-no-access-mobile.png) |
| Payment return confirmed, new link | [Desktop](screenshots/m10/m10-t8/payment-return-confirmed-desktop.png) | [Mobile](screenshots/m10/m10-t8/payment-return-confirmed-mobile.png) |
| Confirmation page without access, new link | [Desktop](screenshots/m10/m10-t8/checkout-missing-link-desktop.png) | [Mobile](screenshots/m10/m10-t8/checkout-missing-link-mobile.png) |
| Confirmation page, new link | [Desktop](screenshots/m10/m10-t8/checkout-confirmed-desktop.png) | [Mobile](screenshots/m10/m10-t8/checkout-confirmed-mobile.png) |
