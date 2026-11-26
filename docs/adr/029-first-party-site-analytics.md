# ADR 029 — First-party, cookieless website analytics and booking funnel

Status: **Accepted** (2026-11-26, M10-T0a).

## Context

The client wants to see in the dashboard how many people visit each branch website, how many start and complete a booking, and at which step and from which page the others leave, to judge whether the site is easy to use (client request relayed 2026-11-17). Reporting so far covers reservation data only (FR-RPT, M12).

Constraints already in force:

- Next.js is the only application framework; no second server (AGENTS.md). A self-hosted analytics product would be a second application.
- Public pages have a script budget of ≤ 260 KB and no third-party script in the critical path ([frontend/performance.md](../frontend/performance.md)).
- A privacy notice is published before analytics are collected, and analytics are minimal ([security/security-controls.md](../security/security-controls.md)). Egypt's PDPL applies (risk RK-14).
- The booking funnel steps already pass through our own API: P5 search, P6 quote, P9 code requested, P10 phone verified, P7 booking, P8 payment result.

## Options considered

1. **Google Analytics 4 (or a similar hosted tool).** Rich, free, familiar. Needs a third-party script and cookies, so a consent banner, and visitors who refuse are not counted. It cannot see server-side outcomes (price changed, sold out, verification abandoned) without custom work, and its data leaves our control.
2. **A self-hosted analytics product** (Plausible, Umami, Matomo). Cookieless options exist, but each is a second application server to deploy, secure, and back up on the VPS, which AGENTS.md forbids.
3. **First-party analytics inside the Next.js application.** A small beacon and server-side step events write to our own PostgreSQL; reports are read models in M12. *Chosen.*

## Decision

- **Module.** A new `analytics` module: pure rules in `src/domain/analytics` (event names, funnel steps, session and drop-off rules), use cases in `src/application/analytics` (`RecordSiteEvent`, `RecordFunnelStep`, `RollUpSiteEvents`, `GetWebsiteReport`), Prisma repositories in `src/infrastructure/db`, construction in `src/composition`. It follows [dependency-rules.md](../architecture/dependency-rules.md) like every other module.
- **Collection.** `POST /api/v1/analytics/events` (API-P11), a thin Route Handler, accepts a fixed list of event names and fields from a beacon of about 1 KB (`navigator.sendBeacon`, `fetch` with `keepalive` as fallback). It records page views and booking-step views, with a fixed step name even when the views share one URL. The funnel steps that pass through the API (search, quote, code requested, phone verified, booking submitted, booking confirmed, checkout refusals, searches with no availability) are recorded **by the server** from those use cases, after their own work and outside their transactions, so a tracking failure can never change a booking.
- **No cookie, no personal data.** The beacon keeps a random session id in `sessionStorage` and sends it with each event and with P7 (`analyticsSessionId`), so a booking is linked to its session without the guest's identity. A visitor is counted by `HMAC(daily salt, IP + user agent)`. The salt is random, kept in `AnalyticsSalt`, and deleted when it rotates at UTC midnight, so hashes cannot be reversed or linked across days. The IP is never stored. Events never hold a name, phone, email, reference, token, code, or query string.
- **Opt-out and bots.** Global Privacy Control (`Sec-GPC: 1`) or Do Not Track stop the beacon and drop server-side step events for that request. Known bot user agents and prefetch requests are dropped.
- **Abuse.** The endpoint takes at most 20 events per request, is strictly parsed, and has its own public limiter bucket (`analytics`, cleaned by `npm run throttles -- cleanup-public`). Invalid fields return `422`, and the limit returns `429` with a retry time. Valid requests within the limit are acknowledged with `204` whether the events are recorded or skipped.
- **Storage and retention.** Raw `SiteEvent` rows are kept for 90 days. A job (`npm run analytics -- rollup`, hourly cron) writes `SiteDailyTotal` rows for each dimension and deletes older raw events (Q-87). Reports read the daily totals plus the raw events of the current day.
- **Reporting.** `GET /api/v1/staff/reports/website` (API-S47, M12-T4b) under `reports:read`, branch scoped with `authorizeBranch`; pages outside a branch are visible to Admins only (Q-88). On screen only (Q-14), every figure with its definition (FR-RPT-2, FR-ANL).
- **Search Console** stays planned as in [frontend/seo.md](../frontend/seo.md). It covers search queries, which first-party data cannot.

- **Search counting.** A browser search step view or a P5 search with a session id counts toward funnel step 3. The search page also records demand without a session id. That event measures unmet demand only. A payment confirmation received without a browser request has no visitor hash.
- **Approved traffic labels.** Store only approved referrer hosts, traffic source and medium labels, and campaign labels. Leave unfamiliar values empty. If the trusted address is missing, keep the session event with no visitor hash and exclude it from the unique visitor count.
- **Activation.** Production recording defaults to off. Enable `ANALYTICS_ENABLED` after the analytics privacy notice is published and the 90 day deletion job is running.
- **Server side recording (M10-T0b).** Composition records the steps after the use case, after the response is sent, and catches every failure. The website booking and payment use cases report a saved and a confirmed booking through optional listeners and import nothing from analytics. Online confirmation is recorded through the id kept on the reservation until the payment resolves; a success after the hold expired is not counted.
- **Totals (M10-T0b).** The job counts UTC days for the whole site, each branch, and pages outside a branch, and deletes raw events only for days that have totals. [Counting rules](../specs/0007-m10-guest-booking-journey.md#settled-during-m10-t0b-2026-11-26)

## Consequences

- No consent banner, no third-party script, and the performance budget holds. Visitors who opt out are not counted, so totals are slightly low; the report says so.
- Unique visitors are daily: a person who visits on two days counts twice, and returning visitors cannot be measured. The report states this limitation.
- Server-side steps make the funnel exact for search, quote, verification, and booking, and enable insights hosted tools cannot give: unmet demand, price-changed and sold-out refusals, verification abandonment (Q-89).
- More to build and run: one migration, one endpoint, one job, one report. Small compared with a second server.
- The privacy notice (Q-30) must describe the analytics before launch (M15).
- If the client later also wants Google Analytics, it can be added behind consent as a separate decision; this ADR does not exclude it.

## References

Q-86, Q-87, Q-88, Q-89 in [assumptions-and-open-questions.md](../requirements/assumptions-and-open-questions.md); FR-ANL in [functional-requirements.md](../requirements/functional-requirements.md); M10-T0a, T0b, T10 in the [M10 brief](../delivery/milestones/m10-guest-booking-journey.md); M12-T4b in the [M12 brief](../delivery/milestones/m12-manager-admin.md).
