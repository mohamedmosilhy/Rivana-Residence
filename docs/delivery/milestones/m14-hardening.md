# M14 — Security, regression, and E2E hardening

Status: **Not started.** Branch: `m14-hardening`. Follow the [milestone loop](./README.md#the-loop-every-milestone-follows).

## Objective

A release candidate for the whole product: branch websites, booking, payments, refunds, staff tools, and messaging, with every gate green or every blocker owned.

## Read first

- [security/threat-model.md](../../security/threat-model.md), [security/security-controls.md](../../security/security-controls.md)
- [testing/testing-strategy.md](../../testing/testing-strategy.md), [testing/test-matrix.md](../../testing/test-matrix.md), [testing/quality-gates.md](../../testing/quality-gates.md)
- [operations/known-limitations.md](../../operations/known-limitations.md), [delivery/risks-and-constraints.md](../risks-and-constraints.md)
- [reports/phase-11-release-candidate.md](../reports/phase-11-release-candidate.md) (the format to follow)

## Blocking questions

- Q-33 (second sign-in step for Admin and Manager): if approved, implement with the Better Auth plugin in this milestone.

## Skills for this milestone

| Step | Skill | Notes |
| --- | --- | --- |
| Spec | `/architect` (`CROSS-CUTTING`) | Test plan only; no new features |
| Fixes | `/debug` then `/develop` for each defect | Minimal fixes, each with a regression test from `/test` |
| Proof | `/check verify` | Full journeys on a production-like build |
| Review | `/check review` | Whole-diff review since M4, security focus |
| After merge | `/sync`, `/document` (`release-note`) | |

## Tasks

1. Threat-model test list executed: authorization sweep for every use case and role, cross-branch IDOR, CSRF on staff REST, payment callback forgery and replay, amount tampering, coupon guessing and limit races, consent and blocked-number exclusion, refund authorization, token leakage, enumeration, log redaction.
2. Dependency audit (`npm audit`), secret scan, client bundle check for server-only code and secrets.
3. Performance (NFR-6) against a production-like dataset: availability search p95 < 500 ms, reservation creation p95 < 800 ms, Lighthouse budgets on branch pages and booking steps.
4. Accessibility: axe on every page; VoiceOver pass on the booking journey and the sync reminder; keyboard-only runs.
5. Cross-browser: WebKit locally; Firefox in Linux CI.
6. OpenAPI review against handlers.
7. Restore drill including all new tables.
8. Paymob sandbox end-to-end (pay, fail, abandon, late success, refund).
9. Second sign-in step for Admin and Manager if Q-33 is approved.
10. Release-candidate report modeled on Phase 11, with residual risks owned and the Phase 12 release checklist drafted.

## Acceptance criteria

1. All gates green on the final tree, or each failure documented with owner, severity, and plan.
2. No known critical or high security defect; no critical or serious accessibility blocker.
3. Performance targets met or exceptions approved.
4. Restore drill and Paymob sandbox run recorded.

## Handoff

Report, then stop. M15 has not started.
