# Rivana Residence documentation

Documentation for the Rivana Residence application: website, staff dashboard, and reservation system. Start with [overview.md](./overview.md).

Every document covers its topic for the whole product. Where part of a topic is not built yet, the document says so (**Implemented** or **Planned**, with the roadmap step that delivers it).

## Map

| Folder | What you find there |
| --- | --- |
| [requirements/](./requirements/business-requirements.md) | [Business](./requirements/business-requirements.md), [functional](./requirements/functional-requirements.md), and [non-functional](./requirements/non-functional-requirements.md) requirements; [roles and permissions](./requirements/user-roles-and-permissions.md); [user stories](./requirements/user-stories-and-acceptance-criteria.md); [stakeholders and workflows](./requirements/stakeholders-and-workflows.md); [scope traceability](./requirements/scope-traceability-matrix.md); [decisions and open questions](./requirements/assumptions-and-open-questions.md) |
| [domain/](./domain/domain-model.md) | [Domain model](./domain/domain-model.md), [glossary](./domain/glossary.md), [business rules index](./domain/business-rules.md), [content model](./domain/content-model.md), [promotions](./domain/promotions.md), [branches](./domain/branch-model.md), [availability and pricing](./domain/availability-and-pricing-rules.md), [reservation lifecycle](./domain/reservation-lifecycle.md) |
| [architecture/](./architecture/overview.md) | [Overview and diagrams](./architecture/overview.md), [module boundaries](./architecture/module-boundaries.md), [dependency rules](./architecture/dependency-rules.md), [project structure](./architecture/project-structure.md) |
| [adr/](./adr/README.md) | Architecture decision records 001–028 |
| [database/](./database/data-model.md) | [Data model and ERD](./database/data-model.md), [integrity and concurrency](./database/integrity-and-concurrency.md), [migrations and seeding](./database/migrations-and-seeding.md) |
| [api/](./api/api-contracts.md) | [REST conventions](./api/rest-api-conventions.md), [error model](./api/error-model.md), [endpoint contracts](./api/api-contracts.md) |
| [security/](./security/security-controls.md) | [Security controls](./security/security-controls.md), [threat model and data protection](./security/threat-model.md) |
| [frontend/](./frontend/route-map.md) | [Route map](./frontend/route-map.md), [design system](./frontend/design-system.md), [component architecture](./frontend/component-architecture.md), [staff dashboard](./frontend/admin-dashboard.md), [booking and operations UI](./frontend/booking-and-operations-ui.md), [SEO](./frontend/seo.md), [performance](./frontend/performance.md) |
| [testing/](./testing/testing-strategy.md) | [Strategy](./testing/testing-strategy.md), [quality gates and latest results](./testing/quality-gates.md), [test matrix](./testing/test-matrix.md) |
| [operations/](./operations/deployment.md) | [Deployment and backups](./operations/deployment.md), [hosting preflight](./operations/hosting-preflight.md), [manual synchronization](./operations/manual-synchronization-procedure.md), [receptionist procedures](./operations/receptionist-procedures.md), [known limitations](./operations/known-limitations.md) |
| [delivery/](./delivery/roadmap.md) | [Roadmap and status](./delivery/roadmap.md), [milestone briefs M4–M15](./delivery/milestones/README.md) (tasks, acceptance criteria, tests, and skills per milestone), [risks and constraints](./delivery/risks-and-constraints.md), the client scope document v2.0 for approval ([PDF](./delivery/Rivana_Residence_Project_Scope_v2.pdf), [HTML source](./delivery/client-scope-v2.html)), and `reports/`: the evidence report of every completed phase and milestone, with screenshots |
| [engineering/](./engineering/engineering-standards.md) | [Engineering standards](./engineering/engineering-standards.md), [agent workflow](./engineering/agent-workflow.md) (the mandatory task-based process, approval gates, risk tiers, review package, skills) |
| [source/](./source/prompt.md) | Source material kept verbatim: the [brief](./source/prompt.md) and the [scope PDF](./source/Rivana_Residence_Project_Scope.pdf) |

Agent skills write their own folders here when used: `specs/` (`/architect`), `scope/` (`/scope`), and `reviews/` (`/check review`).

## Reading paths

- **New to the project:** overview → requirements/business-requirements → architecture/overview → delivery/roadmap.
- **Building a milestone:** the [agent workflow](./engineering/agent-workflow.md) (task by task, with approval gates) → the milestone's [brief](./delivery/milestones/README.md) and its Task breakdown → the requirements, stories, ADRs, and rules it lists → data model and API contracts → engineering standards → quality gates.
- **Running the hotel:** operations/receptionist-procedures and operations/manual-synchronization-procedure.

## Status

Phases 0–11 accepted; reservation milestones M0–M3 accepted (design); client decisions of 2026-11-06 recorded (ADRs 024–028) and the forward plan replanned as M4–M15 and approved (2026-11-06); M4 and M5 accepted (2026-11-07); M6 in progress with M6-T1 through M6-T9 accepted (9/10 tasks, 2026-11-10; [report](./delivery/reports/m6-inventory-and-availability.md)); M7 onward not started, delivered task by task under the [agent workflow](./engineering/agent-workflow.md) adopted 2026-11-07; the branch websites and reservations launch together (Phase 12 + M15). Details: [delivery/roadmap.md](./delivery/roadmap.md#delivery-overview).
