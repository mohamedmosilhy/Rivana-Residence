# Rivana Residence — Complete Software Development Lifecycle, Architecture, Agent Setup, and Reservation System

## 1. Your Role and Mission

Act as a senior software architect, product analyst, domain modeler, database architect, security engineer, senior Next.js developer, UI/UX engineer, QA engineer, and AI coding-agent workflow designer.

You are continuing an existing project called **Rivana Residence**, a hotel marketing website with a content management system.

Your mission is to inspect the existing project, understand its business requirements and architecture, create complete and maintainable software documentation, establish coding standards and AI-agent instructions, and then implement a self-managed hotel reservation system in controlled, testable milestones.

The project must use **Next.js as the only application framework for both the frontend and backend**.

Do not introduce NestJS or another backend application framework.

The backend must expose reusable RESTful APIs implemented through Next.js App Router Route Handlers. Business logic must be organized into independent domain and application modules rather than being placed directly in pages, API handlers, or Server Actions.

The result must be understandable and maintainable by a developer who will review the AI-generated changes.

Prioritize:

- Correct business requirements and domain rules.
- Reuse of existing, working functionality.
- Clean architecture and modular monolith design.
- Readable, strongly typed code.
- SOLID and DRY principles applied pragmatically.
- Single responsibility and explicit dependencies.
- Database integrity and concurrent reservation safety.
- Multi-branch data isolation.
- Secure authentication and authorization.
- Reusable REST API contracts.
- Automated tests and verifiable acceptance criteria.
- Documentation that reflects the actual implementation.
- Small, reviewable implementation milestones.

Do not optimize for producing the most code as quickly as possible. Optimize for correctness, clarity, maintainability, and controlled delivery.

---

## 2. Mandatory Technology Decisions

The following requirements are mandatory.

### Application framework

Use Next.js for both the public website and the backend.

Use the existing Next.js App Router if that is what the repository already uses.

Use TypeScript and Tailwind CSS, following the existing configuration where appropriate.

Do not introduce:

- NestJS.
- A separate Express or Fastify backend application.
- Another backend framework.
- A second application server that duplicates the Next.js backend.
- Server Actions as the primary reservation API.

### Backend architecture

Implement the backend using:

- Next.js Route Handlers for HTTP REST endpoints.
- Independent application services and use cases.
- Domain models and business rules.
- Repository interfaces and infrastructure implementations.
- The existing ORM and relational database where appropriate.
- Explicit validation, authentication, authorization, and error-handling boundaries.

Keep the reservation API reusable by future clients. The website must not be the only way to invoke reservation operations.

Server Actions may be used for narrowly justified internal UI interactions, but must not replace the documented REST API.

### Database

Inspect the existing database, ORM, migrations, and persistence architecture before deciding whether anything needs to change.

Preserve existing data and avoid unnecessary migrations.

Select the database and deployment strategy based on the current repository and the requirements for reliable transactions, locking, and concurrency control.

Next.js does not replace the need for a suitable database.

### Styling and animation

- Use Tailwind CSS for styling.
- Do not use inline style attributes or inline style objects as the normal styling approach.
- Prefer existing reusable design tokens and components.
- Use Framer Motion for ordinary React UI animations where useful.
- Use GSAP only when its capabilities materially justify the additional complexity.
- Respect reduced-motion preferences.
- Avoid decorative animations that harm usability or performance.

If a dynamic visual property genuinely cannot be implemented reasonably with Tailwind, document the exception and choose an accessible, minimal solution.

---

## 3. First Task: Inspect the Existing Repository

Before implementing any new feature, inspect the existing repository.

Understand the actual codebase rather than relying on assumptions about how it was built.

Inspect:

- Root directory and package manager.
- Next.js version and App Router configuration.
- TypeScript configuration.
- Frontend routes and layouts.
- Marketing website and room pages.
- CMS and admin dashboard.
- Existing API Route Handlers, if any.
- Database, ORM, schema, and migrations.
- Existing authentication and authorization.
- Existing user roles and permissions.
- Existing models, services, repositories, and validation.
- UI components and styling conventions.
- Images, fonts, and design assets.
- Existing animation libraries.
- Environment configuration and secrets management.
- Logging and error handling.
- Deployment configuration.
- Unit, integration, end-to-end, accessibility, and performance tests.
- Existing documentation.
- `AGENTS.md`, `CLAUDE.md`, and any other agent instructions.
- Existing agent skills and their configuration.
- Git status, current branch, and uncommitted changes.

Identify:

1. What already works.
2. What can be reused.
3. What must be extended.
4. What is missing.
5. What should not be changed.
6. What could break if modified.
7. Which architecture decisions have already been made.

Do not replace existing implementations simply because another approach is available.

Do not overwrite uncommitted changes.

Do not delete or rename existing modules without understanding their dependencies and documenting the reason.

Run baseline formatting, lint, type-check, test, and build commands where available. Record actual results and existing failures.

### Required scope PDF

Read the existing PDF:

`docs/Rivana_Residence_Project_Scope.pdf`

This PDF documents the earlier reservation plan, which assumed an API integration with the hotel's existing operational system.

Read the actual PDF content and extract its relevant requirements, workflows, screens, entities, business rules, and acceptance criteria.

Map its requirements into:

- Retained without changes.
- Retained with modifications.
- Replaced by the new manual reservation workflow.
- Newly introduced requirements.
- Unresolved questions requiring a business decision.

If the file cannot be accessed or parsed, state that explicitly. Do not claim to have read it.

Complete the initial repository assessment before starting reservation implementation.

---

## 4. Business Background and Project Evolution

Rivana Residence is a hotel business.

The project originally followed Plan A.

### Plan A: Marketing website and CMS

The initial scope included:

- A public marketing website.
- A home page.
- An about page.
- A room listing page.
- An individual page for each room type.
- Hotel facilities and amenities.
- Images, content sections, and other marketing information.
- A CMS admin dashboard.
- Editable website text, images, sections, and page content.
- Book Now buttons.

The CMS allows the administrator to manage the website's marketing content.

The original reservation flow was not supposed to be implemented by us. Book Now buttons would eventually connect to a reservation module supplied by an external hotel management/reservation company.

That external module would communicate with the hotel's operational system to obtain availability and process reservations.

The provider did not supply the required module.

### Plan B: API-based reservations

The next plan was to implement room types, prices, and the reservation journey on our website while using an API from the external provider to check availability and create reservations in its operational system.

The provider did not supply that API either.

### New plan: Self-managed reservations

The new plan is to build the reservation system ourselves using the existing website, CMS, and database infrastructure.

We will manage:

- Branches.
- Room types.
- Physical room inventory, where required.
- Prices.
- Availability.
- Maintenance and unavailability periods.
- Reservations.
- Reservation status.
- Operational reporting.
- Receptionist workflows.

Receptionists will manually record reservations made through the hotel's existing operational system and update relevant inventory or availability in our system.

The new application will not communicate automatically with the external operational system unless an integration becomes available in the future.

The external API must not be assumed to exist.

Do not fabricate API responses or simulate a successful external integration in production code.

Design an explicit integration boundary so that a future external integration can be added without rewriting the core reservation domain.

### Critical operational limitation

Manual synchronization creates a risk of conflicting bookings.

If the hotel's existing operational system accepts a reservation and our receptionist has not yet recorded it in our application, our website may still display availability that no longer exists.

The system must prevent conflicting reservations created within our own database, but it cannot guarantee that an external booking will never conflict with one of ours when the two systems are not synchronized automatically.

Document this limitation prominently.

Design appropriate staff workflows, warnings, audit history, reconciliation procedures, and operational policies to reduce the risk.

Never describe manual synchronization as real-time integration or claim it guarantees zero overbooking.

---

## 5. Project Scope

The project contains three related areas.

### A. Existing marketing website

Preserve and extend the existing public website.

Relevant functionality includes:

- Home page.
- About page.
- Room listing page.
- Room-type detail pages.
- Hotel facilities and amenities.
- Images and content sections.
- Contact information.
- Branch selection.
- Branch-specific room browsing.
- Book Now entry points.
- Responsive design.
- SEO and metadata.
- Accessibility.
- Existing branding and visual identity.

Inspect the actual current routes and content before deciding which features need changes.

Avoid unnecessary redesign or a complete rewrite.

### B. Existing CMS

Preserve the current CMS and its content-management capabilities.

Authorized administrators must continue to manage the website's marketing content, including text, images, sections, and pages according to the existing implementation and approved requirements.

The CMS is restricted to the Admin role.

Receptionist and Manager roles must not gain CMS permissions merely because they can access reservation operations.

Keep content management separate from reservation management at the domain and authorization levels.

### C. New reservation management system

Build the customer booking journey, receptionist operations, management views, and supporting REST APIs.

Evaluate the following capabilities against the PDF and existing business requirements:

- Branch selection.
- Branch-specific room browsing.
- Search by check-in date, check-out date, and guest count.
- Availability search.
- Room type and inventory management.
- Physical room assignment where necessary.
- Branch-specific pricing.
- Seasonal or date-specific pricing where approved.
- Price breakdown.
- Reservation creation.
- Reservation reference generation.
- Reservation confirmation.
- Secure reservation lookup.
- Reservation modification and cancellation.
- Manual reservations created by receptionists.
- External reservations recorded manually.
- Maintenance and availability blocks.
- Reservation status management.
- Check-in and check-out operations if required.
- Operational statistics.
- Occupancy and availability reports.
- Role-based authorization.
- Branch-scoped permissions.
- Audit history.

These are candidate features until validated against the existing scope and business rules.

Do not silently add payment processing, complex discounts, customer accounts, tax rules, email campaigns, or other features that have not been approved.

Document optional features separately.

---

## 6. Multi-Branch Support

Multi-branch support is a core domain requirement from the beginning.

For example, the hotel may have:

- A Cairo branch.
- A Giza branch.
- Additional branches in the future.

The customer must be able to select a branch and view the relevant rooms, prices, and availability for that branch.

The branch must be explicitly represented in the domain model, database, API contracts, and authorization rules.

Analyze and document:

- Branch identity, name, location, contact information, and operational status.
- Branch selection and persistence throughout the booking journey.
- Relationships between branches, room types, physical rooms, and pricing.
- Whether room types are shared concepts or branch-specific configurations.
- Inventory and availability calculations for each branch.
- Reservations associated with a branch.
- Staff access to one or multiple branches.
- Manager reporting scope.
- Administrator access to branch management.
- Behavior when a branch is deactivated.
- Future branch expansion.

Never assume a room type exists at every branch.

Never calculate availability using another branch's inventory.

Never trust a client-supplied branch identifier without validating the resource and authorization context on the server.

Use a simple multi-branch architecture appropriate for one hotel business. Do not introduce unnecessary SaaS multi-tenancy or distributed services.

---

## 7. Roles and Authorization

Inspect the existing authentication system before changing it.

Define a role and permission matrix.

### Customer

Potential permissions:

- Browse public content.
- Select a branch.
- View room types, prices, and availability.
- Create reservations.
- Retrieve or manage reservations through an approved secure mechanism.

Do not assume customer accounts already exist.

Evaluate guest checkout and secure reservation lookup. If reservation references are used for lookup, consider additional verification so that guessing or obtaining a reference does not grant unrestricted access to guest information.

### Receptionist

Potential permissions:

- Access reservation operations.
- View reservations for authorized branches.
- Create reservations for guests.
- Record reservations originating from external channels.
- Modify or cancel reservations when authorized.
- Manage availability and maintenance blocks.
- Update inventory through approved workflows.
- Perform check-in/check-out operations if approved.
- View operational information required for daily work.

### Manager

Potential permissions:

- Access reservation management for assigned branches.
- View reservations and availability.
- View operational statistics and reports.
- Perform other approved operational actions.

### Admin

Potential permissions:

- Access the existing CMS.
- Manage website content.
- Access authorized reservation management and reporting.
- Manage branches and staff assignments if approved.
- Perform privileged operations under appropriate audit controls.

CMS permissions must remain distinct from reservation permissions.

Enforce permissions on every protected backend endpoint.

Frontend navigation and hidden buttons are not security controls.

Document which roles can access each endpoint and which branches they may access.

---

## 8. Modular Monolith and Clean Architecture

Use a modular monolith with explicit domain boundaries.

Do not introduce microservices without a demonstrated requirement.

Evaluate these potential modules:

- Identity and Access Management.
- Branches.
- Room Catalog and Room Types.
- Physical Room Inventory.
- Availability and Maintenance Blocks.
- Pricing.
- Reservations.
- Reporting and Statistics.
- Notifications, if required.
- Existing CMS and Content Management.

Define the responsibility, public interface, owned data, and dependencies of each module.

Avoid unnecessary cross-module database access. Prefer explicit module interfaces.

### Clean architecture layers

Apply the following logical layers where they improve separation of concerns.

#### Domain

Contains:

- Domain entities and aggregates where justified.
- Value objects.
- Domain services.
- Domain policies.
- Business invariants.
- Domain errors.
- Repository or integration ports where appropriate.

The domain must not depend on Next.js, HTTP, React, or ORM-specific implementations.

#### Application

Contains:

- Use cases.
- Application services.
- Commands and queries where useful.
- Input/output models.
- Transaction orchestration.
- Application-level authorization policies.
- Interfaces required by use cases.

Application code coordinates workflows but should not contain HTTP-specific details.

#### Infrastructure

Contains:

- Database implementations.
- ORM repositories.
- Persistence mapping.
- External-service adapters.
- Notification providers.
- Other technical implementations.

Infrastructure implements the abstractions required by the application and domain.

#### Presentation/API

Contains:

- Next.js Route Handlers.
- Request DTOs.
- HTTP validation.
- Response serialization.
- Authentication and authorization integration.
- HTTP error mapping.
- API documentation integration where appropriate.

Route Handlers must remain thin and delegate business operations to application use cases.

### Dependency direction

The intended direction is:

`Presentation/API → Application → Domain`

Infrastructure implements interfaces consumed by the application or domain.

Avoid circular dependencies and framework dependencies in domain code.

Use dependency injection or explicit composition where useful, without building an unnecessary generic dependency-injection framework.

Do not create four empty layers for every trivial feature. Apply the architecture proportionately to the module's complexity and document deviations.

---

## 9. Recommended Project Structure

Inspect the existing repository before changing its structure.

A possible structure, to be adapted rather than imposed blindly, is:

```text
src/
  app/
    (marketing)/
    (booking)/
    (staff)/
    api/
      v1/
        branches/
        room-types/
        availability/
        reservations/
        receptionist/
        manager/
        admin/
  components/
    ui/
    layout/
    shared/
  features/
    branches/
    rooms/
    availability/
    reservations/
    receptionist/
    manager/
    admin/
  modules/
    branches/
      domain/
      application/
      infrastructure/
    rooms/
      domain/
      application/
      infrastructure/
    availability/
      domain/
      application/
      infrastructure/
    pricing/
      domain/
      application/
      infrastructure/
    reservations/
      domain/
      application/
      infrastructure/
    reporting/
      application/
      infrastructure/
  lib/
  infrastructure/
  types/
```

This is an illustrative starting point, not a requirement to create every folder.

Adapt it to the existing repository, current CMS architecture, ORM, and testing conventions.

Keep frontend features and backend domain modules distinct, even when they represent the same business capability.

Do not put database repositories inside React component folders.

Do not put frontend components inside domain modules.

Do not import server-only infrastructure into client components.

Do not create a shared folder that becomes a dumping ground for unrelated code.

Keep route files thin and delegate to feature components or backend use cases.

Use explicit package boundaries if the repository already supports them or if a workspace is justified.

Document the final project structure and the reason for important organizational decisions.

---

## 10. Domain Modeling and Database Design

Design the domain model before implementing migrations.

Inspect the current schema and determine which entities can be reused.

Evaluate these candidate concepts:

- Branch.
- RoomType.
- PhysicalRoom.
- RatePlan or pricing configuration.
- Date-specific prices.
- Reservation.
- ReservationRoom or room allocation.
- Guest or reservation contact information.
- AvailabilityBlock or MaintenanceBlock.
- Staff and branch assignment, integrated with existing identity management.
- AuditLog or reservation history.

Do not create a table for every concept automatically. Justify the final model based on business requirements.

### Room inventory model

Determine whether customers reserve:

1. A specific physical room.
2. A room type, with a physical room allocated later.
3. Multiple rooms within a single reservation.

For the simplest valid initial implementation, prefer room-type inventory with later physical room assignment if that matches hotel operations.

If the customer books a room type rather than a specific room, availability must be based on the number of eligible rooms remaining for each night.

If customers reserve a specific room, overlapping reservations for that room must be prevented.

Explain the selected model and its consequences.

### Availability rules

Define check-in and check-out semantics precisely.

Unless the existing business scope requires otherwise:

- Check-in is inclusive.
- Check-out is exclusive.
- A reservation from October 10 to October 12 occupies the nights of October 10 and October 11.
- Another reservation may begin on October 12 if the room and operational rules permit it.

Handle date-only booking values consistently.

Document the hotel timezone, storage strategy, date comparison rules, and display conventions.

Test adjacent reservations, overlapping dates, same-day boundaries, leap years, and invalid ranges.

### Pricing rules

Document:

- Pricing unit.
- Currency.
- Default nightly rates.
- Date-specific rates if approved.
- Price calculation.
- Rounding.
- Taxes and fees if applicable.
- Cancellation and refund policies if applicable.
- How price changes affect existing reservations.
- Whether price overrides require authorization.

Persist an authoritative price snapshot with the reservation where appropriate.

Historical reservations must not silently change when current room prices change.

Do not invent taxes, payment requirements, cancellation fees, or business policies.

Record missing policies as decisions requiring approval.

### Database integrity

- Use versioned database migrations.
- Preserve existing data.
- Add appropriate foreign keys and indexes.
- Define uniqueness constraints.
- Define deletion behavior deliberately.
- Avoid destructive migrations without a documented migration plan.
- Add development seed data for multiple branches.
- Never seed real guest information or credentials.

Produce an ER diagram and document important invariants.

---

## 11. Reservation Lifecycle and Inventory Consistency

Define the reservation state machine before implementation.

Potential states include:

- Pending, if a temporary hold or approval is needed.
- Confirmed.
- Cancelled.
- Checked In.
- Checked Out.
- No Show, if required.

Do not introduce temporary holds unless the business workflow requires them. If holds are necessary, define their expiration, inventory release, and cleanup behavior.

Specify allowed transitions, responsible roles, and the conditions under which transitions are permitted.

Distinguish between:

- Website reservations.
- Receptionist-created reservations.
- External reservations entered manually.
- Inventory and maintenance blocks.

### Critical concurrency requirement

A naive workflow of checking availability and then inserting a reservation is not sufficient.

Two customers may submit requests simultaneously for the last available room.

Design a transaction-safe booking workflow that revalidates availability during the write operation and prevents inventory from being oversold.

Depending on the chosen inventory model and database, evaluate:

- Transactions.
- Appropriate isolation levels.
- Row-level locks.
- Conditional inventory updates.
- Database constraints.
- Safe physical-room allocation.
- Conflict detection and retry behavior.

The correct solution must be proven with integration tests against the actual database engine, not only mocks.

Do not rely on in-memory locks, frontend checks, or a single application process for correctness.

Return a clear conflict response when the requested inventory is no longer available.

### Idempotency and references

Implement appropriate protection against duplicate reservation creation caused by retries.

Generate unique reservation references and enforce uniqueness in the database.

Document idempotency key scope, expiration or retention policy, and behavior for repeated requests.

Cancelled reservations should release inventory according to approved rules.

Historical reservations must remain available for reporting and audit.

---

## 12. RESTful API Design

The reservation system must use a reusable REST API implemented through Next.js Route Handlers.

Use `/api/v1` unless an existing API convention should be preserved.

The API must not depend on React components or frontend-only state.

Do not use Server Actions as the primary reservation backend.

### Public API candidates

Evaluate endpoints for:

- Branch listing.
- Branch details.
- Branch-specific room catalog.
- Room type details.
- Availability search.
- Price breakdown.
- Reservation creation.
- Secure reservation lookup.
- Authorized reservation modification or cancellation.

### Receptionist API candidates

Evaluate endpoints for:

- Reservation listing and filtering.
- Reservation details.
- Manual reservation creation.
- Recording externally sourced reservations.
- Reservation modification and cancellation.
- Availability blocks.
- Maintenance management.
- Room and room-type inventory.
- Check-in/check-out operations if approved.

### Manager API candidates

Evaluate endpoints for:

- Branch-scoped reservation views.
- Availability views.
- Operational statistics.
- Occupancy reports.
- Other approved management reporting.

### Admin API candidates

Evaluate endpoints for:

- Authorized reservation oversight.
- Branch management.
- Staff and branch assignment, if approved.
- Operational configuration.
- Existing CMS APIs, which must be preserved according to the current architecture.

For every endpoint, document:

- HTTP method.
- Path.
- Purpose.
- Authentication.
- Authorization.
- Branch scope.
- Request DTO.
- Response DTO.
- Validation.
- Status codes.
- Error response.
- Pagination, filtering, and sorting.
- Transaction boundaries.
- Side effects.
- Idempotency requirements.

Use appropriate HTTP semantics, including `400`, `401`, `403`, `404`, `409`, `422` where justified, and `429` where rate limiting applies.

Create a consistent error response structure.

Do not expose ORM models directly as API responses.

Do not return sensitive guest data to unauthorized clients.

Generate and maintain OpenAPI documentation.

Test important API contracts.

---

## 13. Security and Privacy

Inspect existing authentication before introducing changes.

Create a threat model for customer bookings and staff operations.

Evaluate and implement appropriate controls for:

- Authentication.
- Role-based authorization.
- Branch-scoped authorization.
- Session and token security.
- Password storage, if applicable.
- Input validation.
- Output serialization.
- Rate limiting.
- Reservation enumeration.
- Guest data confidentiality.
- CSRF protection where relevant.
- CORS configuration.
- XSS protection.
- SQL injection prevention.
- Secure cookies and HTTPS deployment.
- Secrets management.
- Logging and sensitive-data redaction.
- Audit logging.
- Data retention and privacy.
- Dependency security.
- Privilege escalation.
- Mass assignment.
- Unauthorized reservation modification.

Never implement custom cryptography.

Do not put database credentials or privileged services in browser-accessible code.

Do not assume middleware alone provides complete authorization.

Perform authentication, resource authorization, branch validation, and business invariant checks on the server.

Document how public reservation lookups are protected.

Document security assumptions and residual risks.

---

## 14. Frontend and UI Engineering

Preserve the existing visual identity and reusable design system.

Implement frontend routes and components only after their requirements and API contracts are understood.

Evaluate the following customer journey:

1. Branch selection.
2. Branch landing or room listing.
3. Room type details.
4. Check-in/check-out and guest selection.
5. Availability results.
6. Price breakdown.
7. Guest information.
8. Booking review.
9. Reservation confirmation.
10. Reservation lookup or management.

Evaluate the following staff screens:

### Receptionist

- Operational dashboard.
- Reservation list and filtering.
- Reservation details.
- Manual reservation form.
- External reservation entry.
- Availability calendar or list.
- Maintenance and inventory management.

### Manager

- Branch-aware dashboard.
- Reservation statistics.
- Occupancy and availability reporting.
- Operational reservation views.

### Admin

- Existing CMS.
- Authorized reservation oversight.
- Approved branch and configuration management.

Do not build every possible screen before the underlying requirements are validated.

### Component rules

- Keep route files thin.
- Use small, focused components.
- Use explicit props.
- Separate API clients from presentation.
- Separate form state, client state, and server state.
- Avoid duplicating API request logic.
- Use typed contracts.
- Handle loading, empty, error, success, and conflict states.
- Provide accessible form validation.
- Prevent accidental duplicate submissions.
- Treat the server as authoritative for availability and prices.
- Avoid unnecessary global state management.
- Avoid excessive component abstraction.
- Use semantic HTML and keyboard-accessible controls.
- Support responsive layouts.
- Respect reduced-motion settings.

Document the frontend route map, feature boundaries, component conventions, and state-management strategy.

---

## 15. Code Quality, SOLID, DRY, and Maintainability

All code must be written for long-term maintainability and straightforward human review.

### Single responsibility

Each module, class, function, and component should have one coherent responsibility.

Avoid components that fetch data, implement business rules, manage unrelated state, and render the entire page simultaneously.

Avoid controllers that implement reservation workflows.

Avoid repositories that contain unrelated business policies.

### SOLID

Apply SOLID pragmatically:

- Single Responsibility: one coherent reason to change.
- Open/Closed: extend behavior through appropriate boundaries where extension is expected.
- Liskov Substitution: implementations honor their contracts.
- Interface Segregation: keep interfaces focused.
- Dependency Inversion: business rules depend on abstractions, not infrastructure details.

Do not create interfaces for every class automatically.

### DRY

Avoid duplicating business rules, availability calculations, price calculations, authorization policies, and shared validation.

Do not create misleading abstractions merely because two snippets look similar.

Prefer simple, understandable code over premature generalization.

### Additional rules

- Use descriptive names.
- Use strict TypeScript where compatible.
- Avoid `any`.
- Avoid unsafe type assertions.
- Avoid unnecessary non-null assertions.
- Avoid deeply nested conditionals.
- Avoid magic values.
- Handle errors intentionally.
- Avoid hidden side effects.
- Keep functions reasonably small.
- Keep dependencies explicit.
- Avoid circular imports.
- Avoid global mutable state for business logic.
- Avoid unnecessary inheritance.
- Avoid excessive comments.
- Document complex business invariants and non-obvious decisions.
- Use consistent formatting and linting.
- Do not suppress compiler or lint errors without justification.
- Never hardcode credentials or environment-specific secrets.

Document intentional exceptions.

---

## 16. Testing Strategy

Use a testing pyramid and prioritize business-critical behavior.

Inspect and reuse the existing test framework before adding dependencies.

### Unit tests

Test:

- Date-range overlap.
- Availability calculation.
- Pricing.
- Reservation state transitions.
- Cancellation rules.
- Branch scoping.
- Permission policies.
- Inventory allocation.
- Reservation reference generation.
- Input validation.
- Important domain invariants.

Keep domain tests independent of Next.js and the database where possible.

### Integration tests

Test:

- Database repositories.
- ORM mappings.
- Transaction boundaries.
- Foreign keys and unique constraints.
- Reservation concurrency.
- Inventory allocation.
- Application use cases.
- Route Handler validation.
- Authentication and authorization.
- HTTP status mapping.
- API serialization.
- Error responses.

Use a real isolated test database or an appropriate integration environment.

Do not rely exclusively on mocked repositories to validate database consistency.

### End-to-end tests

Test customer workflows:

1. Select a branch.
2. Search availability.
3. View rooms and prices.
4. Create a valid reservation.
5. Receive a unique reservation reference.
6. Attempt a conflicting reservation when inventory is exhausted.
7. Verify that the conflicting reservation is rejected.
8. Verify that independent branches have separate inventory.
9. Verify that cancellation releases inventory when permitted.

Test staff workflows:

- Receptionist authentication.
- Manual reservation creation.
- External reservation recording.
- Availability blocks.
- Manager reports.
- Admin CMS access.
- Unauthorized access rejection.
- Branch-scoped data restrictions.

### Concurrency testing

Simulate concurrent attempts to reserve the final available inventory.

Verify that the database prevents overselling.

Test the chosen transaction strategy against the actual database engine.

### Frontend testing

Test:

- Forms and validation.
- Loading and error states.
- API conflict handling.
- Branch selection.
- Reservation confirmation.
- Role-based navigation.
- Accessibility.
- Responsive behavior.

### Quality gates

Document the actual commands available in the repository.

Each milestone must pass all applicable checks:

- Formatting.
- Linting.
- Type checking.
- Unit tests.
- Integration tests.
- End-to-end tests.
- Production build.

Never claim that a check passed if it was not run.

Record failures accurately, distinguish pre-existing failures from new regressions, and do not mark blocked work as complete.

---

## 17. Documentation Deliverables

Create a complete documentation system inside the existing `docs/` directory.

Preserve useful existing documentation and update it instead of creating conflicting duplicates.

Adapt the following structure to the actual repository:

```text
docs/
  README.md
  project-overview.md
  repository-assessment.md

  requirements/
    business-requirements.md
    functional-requirements.md
    non-functional-requirements.md
    user-roles-and-permissions.md
    user-stories-and-acceptance-criteria.md
    scope-traceability-matrix.md
    assumptions-and-open-questions.md

  discovery/
    stakeholders-and-workflows.md
    business-rules.md
    risks-and-constraints.md

  domain/
    domain-model.md
    glossary.md
    reservation-lifecycle.md
    availability-and-pricing-rules.md
    branch-model.md

  architecture/
    architecture-overview.md
    architectural-decisions.md
    module-boundaries.md
    dependency-rules.md
    project-structure.md
    deployment-and-environments.md
    diagrams/

  database/
    data-model.md
    erd.md
    migrations-and-seeding.md
    data-integrity-and-concurrency.md

  api/
    rest-api-conventions.md
    api-contracts.md
    error-model.md
    openapi.md

  security/
    threat-model.md
    authentication-and-authorization.md
    data-protection.md

  frontend/
    route-map.md
    component-architecture.md
    design-and-accessibility.md

  testing/
    testing-strategy.md
    test-matrix.md
    quality-gates.md

  operations/
    receptionist-procedures.md
    manual-synchronization-procedure.md
    backup-and-recovery.md
    known-limitations.md

  implementation/
    milestones.md
    implementation-status.md
    release-checklist.md

  agent-workflow.md
  engineering-standards.md
```

Create all relevant documents, but do not create empty documents just to satisfy the proposed tree.

If an equivalent document already exists, update or reference it.

### Documentation standards

Documents must be concise, accurate, internally consistent, and useful for future developers.

Clearly distinguish:

- Verified facts.
- Confirmed requirements.
- Assumptions.
- Recommendations.
- Decisions requiring approval.
- Implemented behavior.
- Planned behavior.

Create Mermaid diagrams where useful:

- System context.
- Application architecture.
- Module dependency relationships.
- Domain model.
- ER diagram.
- Reservation sequence.
- Reservation lifecycle.
- Inventory transaction and concurrency strategy.
- Deployment topology.

Maintain a traceability matrix linking requirements to domain rules, API endpoints, implementation milestones, and tests.

Do not document hypothetical behavior as implemented behavior.

---

## 18. Architecture Decision Records

Create ADRs for important decisions.

Evaluate at least:

1. Modular monolith architecture.
2. Next.js-only application framework.
3. REST API using Next.js Route Handlers.
4. Project and package structure.
5. Clean architecture boundaries.
6. Database and ORM strategy.
7. Inventory and concurrency control.
8. Multi-branch data ownership.
9. Authentication and authorization.
10. Date, timezone, and pricing semantics.
11. API versioning and OpenAPI.
12. Testing strategy.
13. Future external hotel-system integration.
14. Deployment and transaction compatibility.

Each ADR should contain:

- Context.
- Problem.
- Options considered.
- Decision.
- Rationale.
- Consequences.
- Risks.
- Status.

Evaluate actual alternatives before recording decisions.

Do not create ADRs merely to justify decisions already made without analysis.

---

## 19. Claude Code and Codex Agent Setup

The project will use both Claude Code and OpenAI Codex.

Create shared instructions and tool-specific entry points so both agents follow the same architecture and coding standards.

At minimum, evaluate and create:

- `AGENTS.md` — shared engineering instructions, especially for Codex.
- `CLAUDE.md` — Claude Code instructions referencing shared rules.
- `docs/agent-workflow.md` — workflow for planning, implementation, testing, review, and reporting.
- `docs/engineering-standards.md` — authoritative coding and architecture standards.
- `docs/architecture/dependency-rules.md` — architecture boundaries.
- `docs/implementation/milestones.md` — implementation sequencing and completion rules.

Inspect existing agent instruction files before modifying them.

If nested `AGENTS.md` or scoped `CLAUDE.md` files are useful, create them only where they provide meaningful scope-specific instructions.

Avoid conflicting instructions and unnecessary duplication.

### Mandatory agent rules

Both agents must:

1. Read relevant project instructions before editing code.
2. Inspect the existing implementation and tests.
3. Identify relevant requirements and acceptance criteria.
4. Create an implementation plan for nontrivial changes.
5. Preserve unrelated user changes.
6. Follow the approved architecture.
7. Implement only the scope of the current task.
8. Write or update tests.
9. Run relevant quality gates.
10. Update documentation when behavior or architecture changes.
11. Review the diff for unintended modifications.
12. Report changed files, decisions, commands, test results, limitations, and remaining work.
13. Never claim a check passed without running it.
14. Ask for clarification when an unresolved decision materially affects security, data integrity, or business behavior.

### Mandatory framework rules for agents

Explicitly state in both instruction files:

- Next.js is the only application framework.
- Do not introduce NestJS.
- Do not introduce a separate Express or Fastify backend.
- Implement REST APIs through Next.js Route Handlers.
- Keep business logic in independent domain and application modules.
- Do not put complex business workflows in Route Handlers.
- Do not use Server Actions as a replacement for the reusable REST API.
- Keep server-only code out of client bundles.
- Enforce authorization and branch scope on the server.
- Protect reservation consistency through database-backed transaction mechanisms.
- Follow the documented dependency rules.
- Keep documentation and tests synchronized with implementation.

---

## 20. Frontend and Backend Skills

I will provide a link to the relevant agent skills.

Skill source URL:

`[INSERT THE SKILL URL I PROVIDE]`

When the URL becomes available:

1. Inspect the skill's actual contents and installation instructions.
2. Identify whether it is intended for frontend, backend, or both.
3. Verify whether it supports Claude Code, Codex, or both.
4. Install or configure it according to its official instructions.
5. Use the correct skill format and installation location for each agent.
6. Do not assume that a Claude Code skill is automatically compatible with Codex.
7. Do not copy unrelated skills or invent skill contents.
8. Document the installation path, purpose, prerequisites, and verification procedure.
9. Preserve existing user-level skills and configuration.
10. Do not overwrite existing skills without inspecting them.

If separate frontend and backend skills are supplied, configure each for its appropriate tasks.

If the URL is not yet available, create the agent instructions and a skill installation checklist, then continue with all other work. Do not claim that an unavailable skill has been installed.

If an installation requires external downloads, credentials, user-level configuration changes, or additional permissions, explain the required action and obtain approval where necessary.

The frontend skill must reinforce Next.js, React, Tailwind, component architecture, accessibility, and UI testing.

The backend skill must reinforce Next.js Route Handlers, REST API design, clean architecture, database integrity, security, and backend testing.

Neither skill may override the project's explicit Next.js-only requirement.

---

## 21. Implementation Milestones

Create a detailed, dependency-aware implementation plan.

For every milestone, document:

- Objective.
- Requirements addressed.
- Tasks.
- Dependencies.
- Expected files or modules.
- Database changes.
- API changes.
- Acceptance criteria.
- Unit and integration tests.
- End-to-end tests.
- Risks.
- Definition of done.

Use this sequence as a starting point and adjust it after inspecting the repository.

### M0 — Repository discovery and baseline

- Inspect the project.
- Read the PDF.
- Understand existing features.
- Identify reusable code.
- Run baseline checks.
- Record risks and assumptions.

Acceptance: the existing system and scope changes are documented, and no unrelated code has been changed.

### M1 — Requirements and business rules

- Reconcile the PDF with the new reservation plan.
- Define user journeys and permissions.
- Define branch behavior.
- Define inventory and pricing rules.
- Define reservation lifecycle.
- Identify missing decisions.

Acceptance: the requirements, traceability matrix, and unresolved questions are documented.

### M2 — Domain, architecture, database, and API design

- Define bounded contexts and module ownership.
- Design domain entities and invariants.
- Define database schema and relationships.
- Design REST endpoints and DTOs.
- Select transaction and concurrency strategy.
- Document security and deployment constraints.
- Create architecture diagrams and ADRs.

Acceptance: critical domain, API, database, and security decisions are ready for review before implementation.

### M3 — Agent setup and engineering foundation

- Configure `AGENTS.md` and `CLAUDE.md`.
- Establish coding and testing conventions.
- Configure the supplied skills when available.
- Verify scripts and development workflow.
- Establish architecture dependency rules.

Acceptance: agent instructions are consistent, and the documented commands and setup can be verified.

### M4 — Next.js backend foundations

- Implement or extend backend module boundaries.
- Establish Route Handler conventions.
- Establish request validation and error mapping.
- Integrate authentication and authorization.
- Establish logging and configuration.
- Implement database migrations and seed data.

Acceptance: the backend foundation works without breaking existing marketing or CMS functionality.

### M5 — Branches and room catalog

- Implement branch management.
- Implement branch-scoped room types.
- Implement physical room inventory where required.
- Connect public room browsing to the correct branch.
- Enforce branch authorization.

Acceptance: branch data and inventory are isolated correctly.

### M6 — Availability, pricing, and inventory safety

- Implement date-range rules.
- Implement availability calculations.
- Implement pricing and total calculation.
- Implement availability and maintenance blocks.
- Implement transaction-safe inventory checks.
- Add concurrency integration tests.

Acceptance: date boundaries, price calculations, and concurrent booking protection are verified against the actual database.

### M7 — Reservation lifecycle and REST APIs

- Implement reservation creation.
- Implement reference generation.
- Implement secure reservation lookup.
- Implement modification and cancellation policies.
- Implement external reservation recording.
- Implement approved reservation state transitions.
- Generate OpenAPI documentation.

Acceptance: reservation workflows pass unit and integration tests and enforce all approved invariants.

### M8 — Customer reservation experience

- Implement branch selection.
- Implement date and guest selection.
- Implement availability results.
- Implement price breakdown.
- Implement guest information.
- Implement booking review and confirmation.
- Implement error and conflict handling.

Acceptance: customers can complete valid bookings and cannot confirm inventory that has become unavailable.

### M9 — Receptionist operations

- Implement reservation lists and details.
- Implement manual reservation entry.
- Implement external reservation recording.
- Implement availability and maintenance management.
- Implement branch-scoped permissions.
- Implement relevant audit history.

Acceptance: receptionists can perform authorized daily operations without bypassing business rules.

### M10 — Manager and admin capabilities

- Implement approved operational statistics.
- Implement reservation oversight.
- Preserve existing CMS functionality.
- Implement approved branch and staff management.
- Enforce role and branch permissions.

Acceptance: each role can access only its authorized functionality and data.

### M11 — Security, regression, and end-to-end testing

- Perform security review.
- Verify branch isolation.
- Test booking concurrency.
- Test customer and staff workflows.
- Verify accessibility and responsiveness.
- Verify API documentation.
- Verify logging and audit history.
- Run all applicable quality gates.

Acceptance: required checks pass or remaining blockers are explicitly documented with a resolution plan.

### M12 — Release and operational handover

- Prepare deployment instructions.
- Prepare database migration procedures.
- Document backups and recovery.
- Write receptionist procedures.
- Document manual synchronization.
- Document known limitations.
- Complete the release checklist.

Acceptance: the application can be deployed and operated using documented procedures, with known risks clearly communicated.

Do not begin implementation of the entire system in a single uncontrolled batch.

Do not mark a milestone complete because code has merely been generated.

---

## 22. Manual Synchronization and Receptionist Procedures

Create a practical operating procedure for keeping the website aligned with the hotel's existing operational system.

Document:

- Staff responsibility for synchronization.
- When synchronization should occur.
- How external reservations are entered.
- How cancellations and modifications are recorded.
- How inventory is blocked for maintenance or other reasons.
- How conflicting reservations are identified.
- How discrepancies are escalated.
- How managers review compliance.
- What happens when the website is unavailable.
- How changes are audited.

Evaluate whether the receptionist dashboard should display a warning about potentially stale availability or unsynchronized external reservations.

The application must not claim to know about reservations created elsewhere until those reservations are recorded or an integration exists.

Keep the external integration boundary explicit and documented.

---

## 23. Definition of Done

A milestone is complete only when all applicable conditions are satisfied:

- Approved requirements are implemented.
- Acceptance criteria are checked.
- Module boundaries are respected.
- Domain invariants are enforced.
- Authentication and authorization are correct.
- Branch-scoped access is verified.
- Database changes are represented by migrations.
- Relevant tests are written and pass.
- API contracts and OpenAPI documentation are updated.
- Frontend loading, empty, error, success, and conflict states are handled.
- Existing CMS and marketing functionality remain intact.
- No unrelated changes have been introduced.
- Applicable formatting, lint, type-check, test, and build checks pass.
- Documentation is updated.
- The diff has been reviewed.
- Remaining risks and limitations are documented.

Report the actual result of every quality gate. Never fabricate successful test results.

---

## 24. Working Process

Follow these phases.

### Phase A — Discovery

Inspect the repository and PDF.

Produce the repository assessment, baseline results, initial scope traceability, risks, and open questions.

### Phase B — Documentation and design

Create and maintain the requirements, domain model, architecture, database design, API contracts, security plan, test strategy, agent instructions, and milestone plan.

Identify critical decisions requiring my approval.

Do not implement irreversible or security-sensitive behavior based on unconfirmed assumptions.

Continue with noncontroversial documentation while noncritical questions remain open.

### Phase C — Review and approval

Present the consequential decisions clearly:

- Inventory model.
- Branch and room-type relationships.
- Pricing rules.
- Guest authentication and reservation lookup.
- Reservation lifecycle.
- Cancellation and modification policies.
- Staff permissions.
- Database changes.
- Concurrency strategy.
- Deployment compatibility.
- Changes to existing CMS or marketing features.

Explain trade-offs and recommend the simplest reliable option supported by the requirements.

### Phase D — Implementation

Implement one milestone at a time.

For each milestone:

1. Read the relevant agent instructions and skill.
2. Identify the applicable acceptance criteria.
3. Create a focused implementation plan.
4. Make minimal, coherent changes.
5. Add tests alongside implementation.
6. Run the appropriate quality gates.
7. Update documentation.
8. Review the diff.
9. Report results and blockers.

Do not silently move past failed quality gates.

### Phase E — Release

Verify the full customer and staff workflows, database integrity, security, deployment readiness, and operating procedures.

Produce a final handover report with the actual state of the application and any remaining limitations.

---

## 25. Immediate Instructions: Start Here

Your first task is to inspect the existing repository and read `docs/Rivana_Residence_Project_Scope.pdf`.

Do not immediately implement the reservation system.

First, produce a concise repository assessment containing:

1. Existing application structure and verified technology stack.
2. Existing marketing and CMS functionality that must be preserved.
3. Database, ORM, schema, migrations, and current authentication.
4. Existing architecture and reusable code.
5. Summary of the PDF scope.
6. Differences between the PDF's API-based plan and the new self-managed reservation plan.
7. Proposed domain model, including branches, room types, inventory, pricing, and reservations.
8. Proposed Next.js-only modular monolith architecture.
9. Database integrity and concurrency risks.
10. Security and authorization risks.
11. Open business questions.
12. Documentation files to create or update.
13. Proposed milestones and dependencies.
14. Actual baseline build, lint, type-check, and test results.
15. The pending skill installation steps if the skill URL has not yet been supplied.

Clearly label facts, assumptions, recommendations, and decisions requiring approval.

After presenting the assessment, begin creating the documentation in the repository. Do not start reservation implementation until the required discovery and design work has been completed and consequential unresolved decisions have been addressed.

The final goal is to extend the existing Rivana Residence project into a reliable, secure, maintainable, multi-branch hotel reservation application while preserving the current marketing website and CMS.

**Final non-negotiable rule: Next.js only. One application framework for frontend and backend, RESTful APIs through Next.js Route Handlers, a modular monolith, clean architecture, database-backed reservation consistency, and readable code that a human developer can confidently review and maintain.**