# User roles and permissions

Editor and Admin are implemented (`src/domain/auth/capabilities.ts`). Receptionist, Manager, and branch scope are planned (ADR 018, M4). Cells marked † are recommendations awaiting approval.

## Roles

| Role | Who | Authentication | Branch scope |
| --- | --- | --- | --- |
| Guest (customer) | Anyone on the website | No account. A WhatsApp code proves the phone for a booking or for "My reservations"; the manage link opens one reservation (ADR 019) | The branch they choose |
| Editor (existing) | Content staff | Staff account | None (CMS only; kept, Q-01) |
| Receptionist | Front desk | Staff account | Assigned branches |
| Manager | Branch/hotel manager | Staff account | Assigned branches |
| Admin | Owner/IT | Staff account | All branches |

Accounts are provisioned by an Admin (`npm run staff`, and the Staff screen). There is no public sign-up.

## Capability matrix

| Capability | Editor | Receptionist | Manager | Admin |
| --- | :-: | :-: | :-: | :-: |
| `admin:access` (staff dashboard shell) | ✓ | ✓ | ✓ | ✓ |
| `content:edit`, `content:publish`, `content:archive` | ✓ | – | – | ✓ |
| `content:delete`, `media:delete`, `media:rights` | – | – | – | ✓ |
| `media:upload`, `promotions:manage` | ✓ | – | – | ✓ |
| `enquiries:read`, `enquiries:manage` | ✓ | ✓† | ✓† | ✓ |
| `settings:edit`, `users:manage`, `sessions:revoke-any` | – | – | – | ✓ |
| `sessions:manage-own` | ✓ | ✓ | ✓ | ✓ |
| `reservations:read`, `guests:read` | – | ✓ | ✓ | ✓ |
| `reservations:create`, `reservations:record-external` | – | ✓ | ✓ | ✓ |
| `reservations:decide` (accept/decline) | – | ✓ | ✓ | ✓ |
| `reservations:modify`, `reservations:cancel` | – | ✓ | ✓ | ✓ |
| `reservations:front-desk` (assign, check-in/out, no-show) | – | ✓ | ✓ | ✓ |
| `inventory:read`, `inventory:block` | – | ✓ | ✓ | ✓ |
| `inventory:manage` (add/deactivate physical rooms) | – | –† | ✓ | ✓ |
| `pricing:read` | – | ✓ | ✓ | ✓ |
| `pricing:manage`, `pricing:override` | – | – | ✓ | ✓ |
| `guests:block` (block or unblock a phone number, all branches) | – | – | ✓ | ✓ |
| `reports:read`, `audit:read` | – | – | ✓ | ✓ |
| `branches:manage` | – | – | – | ✓ |

Every reservation, inventory, pricing, and report capability is additionally checked against branch scope.

## Endpoint access summary

| Area | Guest | Receptionist | Manager | Admin |
| --- | --- | --- | --- | --- |
| Public catalog and availability (API-P1–P6) | ✓ | ✓ | ✓ | ✓ |
| Phone verification (API-P9, P10), create website reservation (API-P7) | ✓ | — | — | — |
| Own reservations via link or verified phone (API-G1–G4) | ✓ (own) | — | — | — |
| Guest profiles: search and view (S50, S51) | — | yes (reservations of assigned branches) | yes (assigned) | all |
| Block or unblock a phone (S52, S53) | — | — | ✓ | ✓ |
| Sync status and checkpoints (S28, S29) | — | assigned | assigned | all |
| Reservation list, detail, history (S1, S2, S15) | — | assigned | assigned | all |
| Create and record external (S3, S4) | — | assigned | assigned | all |
| Modify, decide, cancel, front desk (S5–S14) | — | assigned | assigned | all |
| Availability grid, blocks (S20, S24–S28) | — | assigned | assigned | all |
| Physical rooms (S21 read; S22–S23 write) | — | read | assigned | all |
| Rates (S30 read; S31–S34 write) | — | read | assigned | all |
| Reports and audit (S40–S43) | — | — | assigned | all |
| Branches and staff assignment (A2–A4) | — | — | — | ✓ |
| CMS (existing `/admin/pages`, `/rooms`, `/facilities`, `/media`, `/promotions`, `/settings`) | — | — | — | ✓ (+Editor) |

## Rules

- Permissions are enforced in application use cases. Menus and hidden buttons are conveniences, not controls.
- A Receptionist or Manager with no branch assignment sees no reservation data.
- Only an Admin can assign roles or branches. The last active Admin cannot be demoted or deactivated. This is enforced today by the staff CLI (`scripts/staff-admin.ts`); the in-app Staff screen must keep the same rule when it gains role editing.
- Role or assignment changes take effect on the next request. Deactivating a user revokes their sessions (existing behavior).
