# Domain model

## Bounded responsibility

The domain is editorial hospitality content, not hotel operations. A `Room` represents how an accommodation is marketed; it is not inventory. A `Facility` describes an on-site amenity; it does not schedule access. Booking remains an external capability.

## Core concepts

### Site settings

The singleton site identity: residence name, legal/footer copy, logos, phone, email, physical address, map configuration, default metadata, and display preferences. Social links are ordered child records.

Invariants:

- exactly one default settings record;
- contact email and URLs must be valid;
- required brand media must be `READY` media assets;
- booking content may contain CTA wording but no invented rates or availability.

### Page

A managed singleton for `HOME`, `ABOUT`, or `CONTACT`, containing route metadata and a controlled ordered set of `PageSection` records.

Invariants:

- one page per page key;
- section types must be allowed for that page key;
- section payload must pass its type-specific Zod schema;
- section positions are unique inside a page;
- a published page cannot reference pending/deleted media.

### Room

Marketing information for a room type: name, slug, summaries, description, size, adult/child occupancy, bed/view text, features, media, ordering, featured state, and publication state.

Invariants:

- slug is globally unique among rooms and URL-safe;
- adult occupancy is at least one; child occupancy and size are non-negative;
- title, summary, and hero image are required before publication;
- media ordering is deterministic and one image is marked as hero;
- no local price, rate, availability, inventory, or reservation fields exist.

### Room feature

An ordered marketing bullet owned by one room, such as “Private balcony” or “Kitchenette.” `iconKey` is selected from an application allowlist so editors cannot inject arbitrary SVG/HTML.

### Facility

Marketing information for an amenity such as Gym or Swimming Pool. Contains name, slug, summary, rich description, optional opening-hours text, media, ordering, featured state, and publication state.

Invariants mirror Room publication and media rules. Hours remain editorial text until a future scheduling requirement proves that structured weekly hours are necessary.

### Media asset

Metadata for an object stored outside PostgreSQL: storage key, MIME type, byte size, dimensions, alt text, focal point, caption/credit, checksum, status, and ownership timestamps.

Invariants:

- only allowed image formats and configured size/dimension limits;
- storage key and checksum are unique where appropriate;
- alt text is required when used as meaningful content; decorative usage is marked explicitly by the association;
- an asset cannot be hard-deleted while referenced;
- replacement creates/finalizes a new object before references are swapped.

### Contact enquiry

A visitor message with name, email, optional phone, subject/message, lifecycle state, and timestamps. It is not a guest profile or CRM.

Invariants:

- server-validated lengths and email;
- no HTML accepted in visitor fields;
- rate limiting and bot controls run before persistence/delivery;
- retention is finite; archived data is purged according to policy.

### Admin identity

Better Auth owns user, account, session, and verification records. Rivana adds an `ADMIN` or `EDITOR` role. Public registration is disabled; accounts are provisioned by an operator/admin workflow.

## Application ports

```text
PageRepository
RoomRepository
FacilityRepository
SettingsRepository
MediaRepository
EnquiryRepository
UnitOfWork
MediaStorage
ContactDelivery
BookingProvider
CacheInvalidator
```

Repositories speak domain/application DTOs. They do not return Prisma payload types. `MediaStorage`, `ContactDelivery`, and `BookingProvider` isolate vendor SDKs.

## Important use cases

Queries:

- get published navigation/site settings;
- get published page by key;
- list published rooms/facilities;
- get published room/facility by slug;
- list/search admin content and media usage;
- get admin dashboard counts and recent enquiries.

Commands:

- update site settings and social links;
- update/reorder/toggle a page section;
- create/update/publish/unpublish/delete a room or facility;
- begin/finalize/replace/delete media;
- submit/archive/delete an enquiry;
- authenticate/sign out/revoke sessions;
- resolve a booking launch descriptor (disabled initially).

## Publication and deletion policy

- `DRAFT`, `PUBLISHED`, and `ARCHIVED` describe editorial visibility for rooms/facilities.
- Pages are required route singletons and use section visibility plus an overall published flag; they are not deleted through the CMS.
- Room/facility deletion is soft (`ARCHIVED`) by default. Hard deletion is an explicit administrator maintenance action after reference checks.
- Media deletion is blocked when usage count is non-zero and is otherwise a two-step database/object deletion operation.
- Contact enquiries can be archived and later purged; they do not participate in content publication.

## Roles

| Capability | Editor | Administrator |
| --- | ---: | ---: |
| Edit/publish content | Yes | Yes |
| Upload/replace media | Yes | Yes |
| Archive enquiries | Yes | Yes |
| Delete unreferenced media | No | Yes |
| Hard-delete archived content | No | Yes |
| Manage admin users/sessions | No | Yes |
| Change security/integration settings | No | Yes |

Authorization is enforced in each command handler and sensitive query, not only in menus or route layouts.
