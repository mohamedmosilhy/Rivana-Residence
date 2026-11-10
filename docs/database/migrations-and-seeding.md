# Migrations and seeding

How the schema evolves and how databases are filled. The production deployment flow is in [../operations/deployment.md](../operations/deployment.md#build-and-migration-flow).

## Policy

- Prisma migrations are reviewed and committed; production uses `prisma migrate deploy` (`npm run db:deploy`) with the direct database URL, never `migrate dev` or `db push`.
- SQL `CHECK` constraints, exclusion constraints, and partial indexes are added in the migration SQL where Prisma syntax is insufficient.
- Migrations are additive. Destructive changes use expand, migrate, contract across releases.
- Seeds create required records only. They never contain real guest data, real credentials, or invented prices presented as real.
- Content and image import is an idempotent script with stable source keys, not hand-written production SQL.

## Current state (verified 2026-10-24)

- 6 migrations: `20260925134806_initial_content`, `20260925141030_auth`, `20260925170034_media_library`, from M4 `20261106120000_staff_roles_enum` and `20261106120100_branches_and_staff_roles`, and from M5 `20261107120000_reserve_legacy_branch_slugs`. All are additive (the M5 one replaces one CHECK with a stricter one).
- The seed (`prisma/seed-data.ts`) upserts the first branch (`new-cairo`, id `DEFAULT_BRANCH_ID`, the same id the migration inserts) and keys the required pages on `(branchId, key)`.
- `npm run db:migrate` (dev), `npm run db:deploy` (production), `npm run db:seed` (the one seed: structure, first admin, the branch's contact and map, and the old website content with three rooms), `npm run db:seed -- --demo` (the same plus the fictional second branch `demo-giza`; refused when `NODE_ENV=production`).
- The integration and E2E harnesses drop, recreate, and migrate `*_test` databases on each run.

## Planned migrations (one per milestone, each reviewed)

Replanned 2026-11-06 ([roadmap](../delivery/roadmap.md#reservation-milestones)).

| Migration | Milestone | Contents | Data handling |
| --- | --- | --- | --- |
| `…_branches_and_staff_roles` plus `…_staff_roles_enum` (**applied in M4**; rehearsed on a copy of the development data with no row lost and no drift) | M4 | `Branch` (contact, address, map embed, check-in and check-out times, sync settings); `StaffBranchAssignment`; role enum values; `AuditEvent`; `Room.branchId`, `accommodationType`, `bedroomCount`, `bathroomCount`; `Facility.branchId`; `Page.branchId` with unique `(branchId, key)`; `ContactEnquiry.branchId` | Inserts one branch from `SiteSettings` (name, contact, address, coordinates, map, time zone) and sets every room, facility, and page to it, then `SET NOT NULL`. Existing `ADMIN` users need no assignment; `EDITOR`s are untouched (Q-01) |
| `…_reserve_legacy_branch_slugs` (**applied in M5**; rehearsed on a copy of the development data, counts unchanged) | M5 | Recreates `Branch_slug_check` with `about`, `contact`, `rooms`, and `facilities` added to the reserved list (those paths now redirect to the default branch). Otherwise uses the M4 columns; `Promotion` left unused | No data change. Fails loudly if a branch already uses one of the new reserved slugs. The demo seed adds a second fictional branch |
| `…_inventory_and_rates` (`20261108120000`, **M6-T3**; rehearsed on a copy of M5 data: every existing row unchanged, no drift) | M6 | `PhysicalRoom`, `InventoryBlock`, `RoomBaseRate`, `RatePeriod` (one kind); `BlockReason`; `btree_gist` (the migration fails rather than weaken the constraints if the extension is unavailable); CHECKs and the two partial exclusion constraints (`InventoryBlock_no_overlap`, `RatePeriod_no_overlap`) written in SQL because Prisma cannot model them | No data. Units and rates are entered by staff, or by a reviewed seed of approved real data (Q-23). The normal seed only reports that approved data is needed |
| `…_commercial_rules` | M7 | `ServiceOffering`, `Coupon`, `CouponBranch`, `CommercialSettings` (VAT nullable) | No production data; the Admin enters the VAT rate in the dashboard (Q-05) |
| `…_reservations` | M8 | `WhatsAppSettings` (empty number placeholder), `WhatsAppTemplate`, `Reservation` (price snapshot, payment columns, PMS-entry columns), `ReservationRoom`, `ReservationNight`, `ReservationService`, `CouponRedemption`, `NotificationOutbox` (per channel), `Guest` (with marketing consent), `PhoneVerification`, `BranchSyncCheckpoint`; checks; composite FKs | No data |
| `…_payments_and_cancellations` | M9 | `Payment`, `PaymentEvent`, `CancellationRequest`; hold index; status checks | No data |
| `…_marketing` | M13 | `Broadcast`; outbox `broadcastId` | No data |
| `…_drop_promotions` and `SiteSettings` contact columns | After launch (contract step) | Drops the retired `Promotion` table and moved settings columns | Only after a release in which nothing reads them |

Rules for these migrations (in addition to the policy above):

- No renames or drops of existing columns.
- `ALTER TYPE … ADD VALUE` cannot run inside a transaction block on older PostgreSQL versions and cannot be used in the same transaction that adds it. M4 keeps it in its own migration (`…_staff_roles_enum`), and nothing in that migration uses the new values; verified on PostgreSQL 18.
- After each migration: `prisma migrate diff --from-config-datasource --to-schema` must report no difference on a scratch database (the Phase 11 drift check).
- Production backups run before `db:deploy` ([../deployment.md](../operations/deployment.md#backups-and-recovery)).

## Seed data

| Seed | Purpose | Contents |
| --- | --- | --- |
| `db:seed` (the one seed, `prisma/seed.mts` with steps in `prisma/seed/`) | Every environment | In order: **structure** (settings, default branch, three pages: `prisma/seed-data.ts`), **admin** (the first administrator from `SEED_ADMIN_PASSWORD`; no default; an existing account is never reset), **branch** (the New Cairo branch's contact, address, coordinates, map embed link, and check-in 14:00 and check-out 12:00; a field that already has a value is kept), **content** (the old site's three rooms, facilities, 33 photos, and page text, only while the database has no rooms, facilities, or images). Needs `DATABASE_URL`, `MEDIA_STORAGE_ROOT`, and `SEED_ADMIN_PASSWORD`. Safe to repeat: an existing admin keeps its password; a branch that staff have edited (any dashboard or API save sets `updatedById`) is left completely alone, and on an unedited branch only empty fields are filled. An existing database keeps the contact and map copied by the M4 migration; edit them in the dashboard. If the content step is interrupted (images but no rooms), the seed warns and skips, so start again from an empty database. **Each task that adds tables or features adds its own step here, with a test.** |
| `db:seed -- --demo` (step 5 of the same seed, `prisma/seed/demo.ts`) | Local review only; **refused in production** (when `NODE_ENV=production`, or when `APP_URL` is set to a host other than localhost, because an SSH shell on the server often has no `NODE_ENV`), and any other flag is an error | The fictional second branch `demo-giza` ("Rivana Giza (demo)", **active**, so the branch chooser and switcher show) with its own three published pages, two facilities, one room, and one apartment, reusing the real photos already in the library. Created once; a re-run changes nothing (an older inactive `demo-giza` stays inactive: set it to Active in Admin > Branches). All photos are checked before anything is written, so a missing photo creates nothing. **M6 (implemented):** a separate substep, `seedDemoInventory`, runs for new and already-existing `demo-giza` branches: 2–3 fictional units (`DEMO-…` labels), a base rate, and one labelled period (Jan 2027) for each demo listing, using fixed identities and create-only inserts, so staff edits (labels, prices, inactive states, cancellations) are never overwritten. New Cairo gets no invented inventory or prices; the normal seed only logs that approved data is needed. The `--demo` production refusal happens before any write (tested through the real entry point). **Planned:** each later milestone adds its demo data to this step with a test: demo services, coupons, and a demo VAT rate, clearly fictional (M7); reservations in every status including `AWAITING_PAYMENT`, `PAYMENT_FAILED`, an open cancellation request, website bookings entered and not entered in the hotel system, with **fictional** guests (`guest1@example.test`, phones in the fictional `+1 555 01xx` range), one blocked guest, a sync checkpoint history, and one block (M8–M9) |
| Test fixtures | Integration/E2E | Built per test; two branches with identically named room types to prove isolation |

Never seed real guest data or real credentials. Demo staff accounts for Receptionist and Manager are created through `npm run staff -- create`. Passwords come from stdin or a prompt, never from a file in the repository.

## Scheduled jobs (cron)

- `npm run reservations -- outbox` every minute or two (M8): sends pending email and WhatsApp messages (transactional, feedback, broadcasts) and retries failures with backoff.
- `npm run reservations -- expire-holds` every minute (M9): moves `AWAITING_PAYMENT` past `holdExpiresAt` to `PAYMENT_FAILED`, releasing units and coupon redemptions.
- `npm run reservations -- reconcile-payments` every 5 minutes (M9): asks Paymob for the result of sessions that expired with no callback.
- `npm run reservations -- expire-tokens` daily (M8): clears manage-token hashes past expiry.
- No data-retention purge: guest and reservation data is kept indefinitely (Q-13).
