# Audit repair tasks

These files schedule the remaining engineering audit findings as small tasks in the milestone where they belong. Each task follows the normal milestone loop: plan, approve, implement, test, verify, independently review, accept, and then commit.

F02 and F03 are complete and merged. F01 dependency security is patched and verified before public exposure. The tasks below are the remaining prelaunch repairs. F13 stays in M12.

| Milestone gate | Repair file | Tasks |
| --- | --- | --- |
| Before M6 deployment rehearsal | [pre-m6.md](./pre-m6.md) | F07, F08 |
| M11 front desk | [m11-front-desk.md](./m11-front-desk.md) | F09 |
| M12 manager and admin | [m12-manager-admin.md](./m12-manager-admin.md) | F13 |
| M14 hardening | [m14-hardening.md](./m14-hardening.md) | F04, F05, F06, F10, F11, F12, F14 |

Do not begin a listed milestone's release rehearsal until its repair tasks are accepted, unless the owner explicitly records an exception.
