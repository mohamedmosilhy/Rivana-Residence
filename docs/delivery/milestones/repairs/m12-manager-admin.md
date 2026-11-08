# M12 audit repair task

F13 remains assigned to M12 as requested. It must not be moved into M14 or a separate catch up milestone.

## Task breakdown

| Task | Finding | Title | Risk | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| M12-R1 | F13 | Enforce the final administrator invariant | High | Staff role management in M12 | Not started |

## M12-R1, F13

Concurrent staff management operations must never remove the last active administrator.

Done when the invariant is enforced in one locked transaction, two concurrent operations cannot eliminate all active administrators, and the failure is reported without a partial mutation.
