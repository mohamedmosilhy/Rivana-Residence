# Migrations and seeding

How the schema evolves and how databases are filled. The production deployment flow is in [../operations/deployment.md](../operations/deployment.md#build-and-migration-flow).

## Policy

- Prisma migrations are reviewed and committed; production uses `prisma migrate deploy` (`npm run db:deploy`) with the direct database URL, never `migrate dev` or `db push`.
- SQL `CHECK` constraints, exclusion constraints, and partial indexes are added in the migration SQL where Prisma syntax is insufficient.
- Migrations are additive. Destructive changes use expand, migrate, contract across releases.
- Seeds create required records only. They never contain real guest data, real credentials, or invented prices presented as real.
- Content and image import is an idempotent script with stable source keys, not hand-written production SQL.

## Current state (verified 2026-10-24)

- 3 committed migrations: `20260925134806_initial_content`, `20260925141030_auth`, `20260925170034_media_library`. All are additive.
- `npm run db:migrate` (dev), `npm run db:deploy` (production), `npm run db:seed` (required pages and settings), `npm run db:seed:demo`, `npm run db:seed:initial` (old website content, three rooms, admin account).
- The integration and E2E harnesses drop, recreate, and migrate `*_test` databases on each run.

## Planned migrations (one per milestone, each reviewed)

| Migration | Milestone | Contents | Data handling |
| --- | --- | --- | --- |
| `…_branches_and_staff_roles` | M4 | `Branch`; `StaffBranchAssignment`; role enum values; `AuditEvent`; `Room.branchId` | Inserts one branch from `SiteSettings` (name, contact, time zone), sets every `Room.branchId` to it, then `SET NOT NULL`. Existing `ADMIN` users need no assignment; `EDITOR`s are untouched (Q-01) |
| `…_inventory_and_pricing` | M5/M6 | `PhysicalRoom`, `InventoryBlock`, `RoomBaseRate`, `RatePeriod`; `btree_gist`; exclusion constraints | No data. Physical rooms and rates are entered by staff, or by a reviewed seed of approved real data (Q-23) |
| `…_reservations` | M7 | `Reservation`, `ReservationRoom`, `ReservationNight`, `NotificationOutbox` (per channel), `Guest`, `PhoneVerification`, `BranchSyncCheckpoint`, branch sync settings columns; checks; composite FKs | No data |

Rules for these migrations (in addition to the policy above):

- No renames or drops of existing columns.
- `ALTER TYPE … ADD VALUE` cannot run inside a transaction block on older PostgreSQL versions and cannot be used in the same transaction that adds it. Keep it in its own migration if Prisma's generated SQL requires that. Verify in M4.
- After each migration: `prisma migrate diff --from-config-datasource --to-schema` must report no difference on a scratch database (the Phase 11 drift check).
- Production backups run before `db:deploy` ([../deployment.md](../operations/deployment.md#backups-and-recovery)).

## Seed data

| Seed | Purpose | Contents |
| --- | --- | --- |
| `db:seed` (required) | Every environment | Adds nothing reservation-specific except that the default branch exists, which the migration already ensures |
| `db:seed:demo` (extend in M5–M7) | Local review | A second fictional branch ("Demo Giza", inactive by default), 2–4 physical rooms per room type, base rates and one seasonal and one offer period, a handful of reservations in every status with **fictional** guests (`guest1@example.test`, phones in the fictional `+1 555 01xx` range), one blocked guest, and a sync checkpoint history, one block |
| Test fixtures | Integration/E2E | Built per test; two branches with identically named room types to prove isolation |

Never seed real guest data or real credentials. Demo staff accounts for Receptionist and Manager are created through `npm run staff -- create`. Passwords come from stdin or a prompt, never from a file in the repository.

## Scheduled jobs (cron, M7)

- `npm run reservations -- outbox` every few minutes: sends pending email and WhatsApp messages and retries failures with backoff.
- `npm run reservations -- expire-tokens` daily: clears manage-token hashes past expiry.
- No data-retention purge: guest and reservation data is kept indefinitely (Q-13).
