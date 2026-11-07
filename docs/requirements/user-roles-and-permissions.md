# User roles and permissions

All four staff roles and the full capability matrix are implemented (`src/domain/auth/capabilities.ts`, M4). Branch scope is implemented too: `authorizeBranch` and `branchScope` in `src/application/auth/authorize-branch.ts`, and assignments loaded with the session. The table test `tests/unit/auth/authorization.test.ts` (T-AUTHZ-1) mirrors this matrix. The reservation capabilities exist, but nothing uses them until M6+. Cells marked † are recommendations awaiting approval; Q-26 (enquiries) was accepted as recommended, and in M4 Receptionists and Managers see only enquiries from their branches, which is none until M5 records the branch on new enquiries.

## Roles

| Role | Who | Authentication | Branch scope |
| --- | --- | --- | --- |
| Guest (customer) | Anyone on the website | No account. A WhatsApp code proves the phone for a booking or for "My reservations"; the manage link opens one reservation (ADR 019) | The branch site they choose |
| Editor (existing) | Content staff | Staff account | None: edits every branch's content, no reservation data (Q-01) |
| Receptionist | Front desk | Staff account | Assigned branches |
| Manager | Branch/hotel manager | Staff account | Assigned branches |
| Admin | Owner/IT | Staff account | All branches |

Accounts are provisioned by an Admin (`npm run staff`, and the Staff screen). There is no public sign-up.

## Capability matrix

Updated for the client decisions of 2026-11-06 (Q-36…Q-50). `reservations:decide` (confirm or decline pending requests) is removed with the `PENDING` status; `promotions:manage` is retired with the popup in M5.

| Capability | Editor | Receptionist | Manager | Admin |
| --- | :-: | :-: | :-: | :-: |
| `admin:access` (staff dashboard shell) | ✓ | ✓ | ✓ | ✓ |
| `content:edit`, `content:publish`, `content:archive` (every branch's pages, listings, facilities) | ✓ | – | – | ✓ |
| `content:delete`, `media:delete`, `media:rights` | – | – | – | ✓ |
| `media:upload` | ✓ | – | – | ✓ |
| ~~`promotions:manage`~~ (implemented; retired in M5) | ✓ | – | – | ✓ |
| `enquiries:read`, `enquiries:manage` | ✓ | ✓† | ✓† | ✓ |
| `settings:edit` (brand settings, WhatsApp number, templates, test message), `users:manage`, `sessions:revoke-any` | – | – | – | ✓ |
| `sessions:manage-own` | ✓ | ✓ | ✓ | ✓ |
| `reservations:read`, `guests:read` | – | ✓ | ✓ | ✓ |
| `reservations:create`, `reservations:record-external` | – | ✓ | ✓ | ✓ |
| `reservations:pms-entry` (mark a website booking entered in the hotel system) | – | ✓ | ✓ | ✓ |
| `reservations:modify`, `reservations:cancel` (unpaid reservations) | – | ✓ | ✓ | ✓ |
| `reservations:cancel-paid` (cancel with a Paymob refund, Q-62†) | – | – | ✓ | ✓ |
| `cancellations:decide` (approve or reject guest requests; triggers refunds) | – | – | ✓ | ✓ |
| `reservations:front-desk` (assign, check-in/out, no-show) | – | ✓ | ✓ | ✓ |
| `inventory:read`, `inventory:block` | – | ✓ | ✓ | ✓ |
| `inventory:manage` (add/deactivate units) | – | –† | ✓ | ✓ |
| `pricing:read` | – | ✓ | ✓ | ✓ |
| `pricing:manage`, `pricing:override` | – | – | ✓ | ✓ |
| `services:manage` (breakfast and transfer prices, on/off) | – | – | ✓ | ✓ |
| `coupons:manage` (Manager: codes limited to assigned branches) | – | – | ✓ | ✓ |
| `tax:manage` (VAT rate, all branches) | – | – | – | ✓ |
| `marketing:broadcast` (WhatsApp offers to opted-in guests) | – | – | ✓ | ✓ |
| `guests:block` (block or unblock a phone number, all branches) | – | – | ✓ | ✓ |
| `reports:read`, `audit:read` | – | – | ✓ | ✓ |
| `branches:manage` | – | – | – | ✓ |

Every reservation, inventory, pricing, service, coupon, cancellation, marketing, and report capability is additionally checked against branch scope. A coupon valid at all branches can be created or edited only by an Admin.

## Endpoint access summary

| Area | Guest | Receptionist | Manager | Admin |
| --- | --- | --- | --- | --- |
| Public catalog, availability, quote (API-P1–P6) | ✓ | ✓ | ✓ | ✓ |
| Phone verification (API-P9, P10), create website reservation (API-P7) | ✓ | — | — | — |
| Payment callback (API-P8) | Paymob only (HMAC-verified) | — | — | — |
| Own reservations via link or verified phone, cancellation requests (API-G1–G4) | ✓ (own) | — | — | — |
| Guest profiles: search and view (S50, S51) | — | yes (reservations of assigned branches) | yes (assigned) | all |
| Block or unblock a phone (S52, S53) | — | — | ✓ | ✓ |
| Sync status and checkpoints (S28, S29) | — | assigned | assigned | all |
| Reservation list, detail, history (S1, S2, S15) | — | assigned | assigned | all |
| Create and record external (S3, S4) | — | assigned | assigned | all |
| Modify, cancel unpaid, front desk, manage link, PMS entry (S5, S6, S9–S14, S16) | — | assigned | assigned | all |
| Cancel paid (S9 with refund) | — | — | assigned | all |
| Cancellation requests (S17 read; S18, S19 decide) | — | — | assigned | all |
| Payments and refund retry (S44 read; S45 retry) | — | read (assigned) | assigned | all |
| Availability grid, blocks (S20, S24–S27) | — | assigned | assigned | all |
| Units (S21 read; S22–S23 write) | — | read | assigned | all |
| Rates (S30 read; S31–S34 write) | — | read | assigned | all |
| Services (S35 read; S36 write) | — | read | assigned | all |
| Coupons (S37–S39) | — | — | assigned branches only | all |
| VAT and commercial settings (A5) | — | — | read | ✓ |
| WhatsApp settings, templates, test message (A6–A8) | — | — | — | ✓ |
| Reports and audit (S40–S43) | — | — | assigned | all |
| Broadcasts (S60–S62) | — | — | assigned | all |
| Branches and staff assignment (A2–A4) | — | — | — | ✓ |
| CMS (existing `/admin/pages`, `/rooms`, `/facilities`, `/media`, `/settings`; per branch from M5) | — | — | — | ✓ (+Editor) |

## Rules

- Permissions are enforced in application use cases. Menus and hidden buttons are conveniences, not controls.
- A Receptionist or Manager with no branch assignment sees no reservation data.
- Only an Admin can assign roles or branches. The last active Admin cannot be demoted or deactivated. This is enforced today by the staff CLI (`scripts/staff-admin.ts`), which also does the following (M4):
  - It takes `--role RECEPTIONIST|MANAGER` and `--branch <slug>` (repeatable) on `create`, and has the `assign-branch` and `unassign-branch` commands.
  - It refuses branches for Admins and Editors.
  - It clears a user's assignments when their role becomes Admin or Editor.
  - It writes an `AuditEvent` (actor `SYSTEM`) for every role and assignment change.

  The in-app Staff screen must keep the same rules when it gains role editing.
- Role or assignment changes take effect on the next request. Deactivating a user revokes their sessions (existing behavior).
