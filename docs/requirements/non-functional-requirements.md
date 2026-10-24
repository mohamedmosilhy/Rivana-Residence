# Non-functional requirements

These apply to the whole application. "Implemented" means it is enforced or verified today (see [../testing/testing-strategy.md](../testing/testing-strategy.md)); "Planned" means it applies to the reservation features as they are built.

| Id | Area | Requirement | Status |
| --- | --- | --- | --- |
| NFR-1 | Consistency | No room-type night is sold beyond capacity within Rivana's database under any interleaving of concurrent requests (ADR 016), proven by concurrency tests on PostgreSQL. | Planned |
| NFR-2 | Isolation | No query or write uses another branch's inventory, prices, or reservations. Composite foreign keys and branch-scoped repositories enforce it. | Planned |
| NFR-3 | Security | Server-side authentication and capability checks on every protected page, action, and endpoint, plus branch checks for reservation data. All untrusted input validated with Zod at the server boundary ([../security/security-controls.md](../security/security-controls.md), [../security/threat-model.md](../security/threat-model.md)). | Implemented (CMS); planned (branch scope) |
| NFR-4 | Privacy | Guest and enquiry personal data is visible only to authorized staff and, for a reservation, to the holder of its link or of the verified phone. It is never logged and is redacted in audit diffs. Guest and reservation data is kept indefinitely (Q-13); the privacy notice says so. | Partly implemented |
| NFR-5 | Reliability | Email failure never loses or rolls back an enquiry or reservation (recorded status, outbox and retry). A process restart loses no state. | Implemented (enquiries); planned (reservations) |
| NFR-6 | Performance | Public pages meet the Lighthouse budgets (accessibility ≥ 95, best practices ≥ 90, SEO ≥ 95, CLS ≤ 0.1, ≤ 260 KB script). Image-heavy pages avoid layout shift and excessive transfer. p95 availability search < 500 ms and p95 reservation creation < 800 ms at this hotel's scale (≤ 10 branches, ≤ 200 rooms, ≤ 100k reservations). | Implemented (pages); planned (reservations, measured in M11) |
| NFR-7 | Availability | Single cPanel process group. Planned maintenance is announced to staff. The website-down procedure is in operations. | Implemented |
| NFR-8 | Accessibility | WCAG 2.2 AA for every page and flow, including the booking journey and staff screens: keyboard operation, visible focus, semantic controls, labelled inputs, errors announced and linked to fields, no time limits, reduced motion respected. | Implemented; applies to new screens |
| NFR-9 | Responsiveness | Works from 320 px; primary QA widths 390, 768, 1024, 1280, and 1440 px. Staff screens are fully usable from 768 px and usable on phones for lookups. | Implemented; applies to new screens |
| NFR-10 | Maintainability | Business rules live in domain and application modules with unit tests. Pages, components, Route Handlers, and Server Actions stay thin. No Prisma calls outside infrastructure. Dependency rules are lint-enforced. | Implemented |
| NFR-11 | Observability | Request ids; structured logs without personal data; audit trail; email delivery status visible to staff. | Partly implemented |
| NFR-12 | Compatibility | Next.js only. PostgreSQL 17+ (with `btree_gist` for reservations). Node 22 under Passenger. No in-process coordination (ADR 022). | Implemented; extension planned |
| NFR-13 | Honesty | The UI never claims real-time sync with the hotel system, never shows success before the server confirms, labels website requests "request received" until staff confirm (Q-02), and never shows invented prices or availability. | Implemented (disabled Book Now); planned (booking) |
| NFR-14 | Internationalization | English at launch. Money is shown in US dollars (`en-US` currency format); dates are shown in the branch time zone. The content and reservation models do not block Arabic later. | Implemented |
| NFR-15 | Testability | Clock, ids, tokens, storage, and email are injected, so tests are deterministic. | Implemented |
| NFR-16 | Rendering | Server Components by default; client JavaScript only for interaction (ADR 009). Public content reads are cached and invalidated precisely after admin changes; admin and reservation reads are dynamic. | Implemented |
| NFR-18 | Anti-abuse | Online bookings require a WhatsApp-verified phone; verification codes are hashed, short-lived, attempt-limited, and rate-limited per number and per client; blocked numbers cannot obtain codes. | Planned |
| NFR-17 | Operability | Content updates, image uploads, promotions, prices, and inventory never require code changes or redeployment. Database, media storage, email, and booking launch are replaceable adapters. | Implemented (content); planned (prices, inventory) |
