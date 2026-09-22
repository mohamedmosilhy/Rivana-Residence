# Admin dashboard

## Approach

The admin is a protected route group inside the same Next.js application. It uses the same domain/application services and token foundation but a task-oriented, quieter UI. This avoids a second deployment and duplicated auth/data contracts.

## Information architecture

Primary navigation:

- Overview
- Pages
- Rooms
- Facilities
- Media
- Enquiries
- Settings

The current location is shown with a page title and breadcrumb. On small screens, navigation moves into an accessible sheet. The public website and sign-out actions remain easy to find.

## Dashboard overview

Show only useful operational information:

- published/draft room and facility counts;
- media items needing alt text or failed uploads;
- new enquiries;
- recently updated content;
- shortcuts to edit Home, add a room, upload media, and view the site.

Do not add charts, revenue, occupancy, booking, or enterprise widgets.

## Page editor

- Separate Home, About, and Contact entries.
- Show the approved section sequence and visibility.
- Edit fields through section-specific forms rather than raw JSON.
- Allow reordering only for optional sections permitted by the page policy.
- Media fields open the shared media picker.
- Show SEO preview and publish-readiness issues.
- Provide “View page” and authenticated preview behavior.

## Room workflow

List columns: thumbnail, name, slug, status, featured, updated time, actions. Filters: status and featured; search by name.

Edit groups:

1. Basics — name, slug, short/long description.
2. Marketing facts — size, adult/child occupancy, bed, view.
3. Features — ordered repeatable labels/icons.
4. Media — required hero plus ordered gallery and alt status.
5. Discovery — featured/order.
6. SEO — title, description, OG image.
7. Publication — readiness, draft/publish/archive.

There are no price or availability fields.

## Facility workflow

Mirrors room UX with facility-specific fields: name, slug, summary, body, optional opening hours, hero/gallery, featured/order, SEO, and publication.

## Media workflow

- drag/drop or file picker upload;
- server-issued signed upload and finalization;
- progress and retry states;
- grid/list view with search and filters for status, type, missing alt, and unused;
- details panel for alt text, focal point, caption/credit, dimensions, size, and usage references;
- replace action creates a new object, then updates selected references after confirmation;
- delete is blocked when referenced and requires administrator confirmation when unused;
- bulk upload is allowed; bulk delete is deferred unless a real need appears.

Initial limits: JPEG, PNG, WebP, and AVIF after decoder/security verification; reject SVG uploads (brand SVGs remain developer-vetted assets), animated images, and files over the configured byte/pixel limits.

## Enquiries

List new/read/archived messages with received date, sender, subject, and delivery status. Detail view renders all visitor input as text, never HTML. Editors can mark read/archive; export, CRM sync, and automated replies are not initial scope.

## Settings

Groups:

- Identity: residence name and logo variants.
- Contact/location: phone, email, address, coordinates/map configuration.
- Social links: platform, URL, visibility, order.
- Footer/legal: footer text and approved policy links.
- Default SEO: title template, description, social image.
- Booking: read-only “Not configured” status initially; no pretend URL field until provider requirements exist.
- Account/security: current user password/session management; user management is administrator-only.

## Form behavior

- React Hook Form plus Zod resolver for interactive/repeatable forms; the same schemas are re-run on the server.
- Simple forms may submit directly to Server Actions without client form libraries.
- Save and publish are distinct when publication readiness matters.
- Pending buttons prevent duplicate submission.
- Field errors remain next to fields and an error summary focuses on submission failure.
- Successful changes produce an announced toast/status and update timestamps.
- Unsaved-change warning applies only when meaningful and never traps navigation incorrectly.

## Destructive actions

- Archive is preferred to delete for rooms/facilities.
- Confirmation names the target and states public impact.
- Media deletion first displays usage count and references.
- Only administrators can hard-delete content, delete media, manage users, or change integration/security settings.

## Authentication UX

- `/admin/login` contains email/password, generic invalid-credentials errors, rate-limit feedback, and password-reset link when email delivery is configured.
- No public sign-up.
- Sessions are revocable and expire according to security policy.
- Authenticated users visiting login are redirected to `/admin`; logged-out access to protected routes returns to login with a safe internal return path.
