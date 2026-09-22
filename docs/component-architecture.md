# Component architecture

## Principles

- Server Components compose pages and data by default.
- Client boundaries are small, explicit interaction islands.
- Components consume view models, not Prisma records.
- UI primitives have no hotel business knowledge.
- Feature components own feature behavior; design components own presentation patterns.
- Prefer slots/composition and variants over inheritance or one component with dozens of booleans.

## UI primitives

Located under `src/presentation/ui`:

- `Button`, `IconButton`, `LinkButton`
- `Input`, `Textarea`, `Select`, `Checkbox`, `Label`, `Field`, `FormMessage`
- `Dialog`, `AlertDialog`, `Sheet`, `DropdownMenu`, `Tooltip`
- `Container`, `Stack`, `Cluster`, `VisuallyHidden`
- `Badge`, `Separator`, `Skeleton`, `Toast`
- `AspectMedia`, `ResponsiveImage`

Use suitable shadcn/ui source components for admin dialogs, menus, form wiring, and feedback, then style through Rivana tokens. Public editorial components should not inherit the default shadcn visual language blindly.

## Design components

Located under `src/presentation/design`:

- `SiteHeader` and client `MobileNavigation`
- `SiteFooter`
- `PageHero`, `HomeHero`, `BrushDivider`
- `SectionHeading`
- `EditorialSplit`
- `RoomCard`
- `FacilityCard`
- `MediaGallery` with client controls/lightbox
- `FactsList`
- `ContactCTA`
- `SocialLinks`
- `RichTextRenderer`
- `Reveal` (progressive enhancement only)
- `EmptyState`, `ErrorState`

These components use semantic variants such as `surface="plum"` or `tone="inverse"`, not arbitrary color props.

## Feature components

Public:

- `RoomList`, `RoomDetails`, `RoomFeatureList`
- `FacilityList`, `FacilityDetails`
- `ContactForm`
- `BookNowButton` / `BookingLauncher`
- `MapPanel`
- `SeoJsonLd`

Admin:

- `AdminShell`, `AdminSidebar`, `AdminHeader`
- `PageSectionEditor`
- `RoomForm`, `RoomFeatureFields`, `RoomMediaFields`
- `FacilityForm`, `FacilityMediaFields`
- `MediaLibrary`, `MediaUploader`, `MediaPicker`, `MediaDetailsPanel`
- `SettingsForm`, `SocialLinksFields`
- `EnquiryTable`, `EnquiryDetails`
- `PublishControls`, `DestructiveAction`

Feature forms are Client Components only when repeatable fields, live previews, direct uploads, or dirty-state handling require them. Server Actions remain the mutation boundary.

## Page composition

### Home

```text
MarketingLayout
  SiteHeader
  HomeHero + BookNowButton(disabled)
  EditorialSplit
  SectionHeading + RoomList(featured)
  SectionHeading + FacilityList(featured)
  EditorialSplit(lifestyle)
  ContactCTA + ContactForm
  SiteFooter
```

### Room detail

```text
PageHero
RoomDetails
FactsList
MediaGallery
BookNowButton(disabled)
FacilityList(featured)
ContactCTA
```

No rate/calendar component exists before external integration.

### Facility detail

```text
PageHero
FacilityDetails
ResponsiveImage
OpeningHours (only when populated)
MediaGallery
ContactCTA
```

### Admin edit page

```text
AdminShell (server/authenticated)
  breadcrumb + action status
  EntityForm (client only where useful)
    fields
    MediaPicker/Uploader
    SEO fields
    PublishControls
```

## Data contracts

Application queries map to compact view models, for example:

- `RoomCardView`: id, slug, name, shortDescription, verified facts, hero image;
- `RoomDetailView`: above plus rich description, features, ordered gallery, SEO;
- `MediaView`: id, URL, dimensions, alt, focal point, caption/credit;
- `BookingView`: disabled/external/embed discriminated union.

Components never infer publication state, build storage URLs, query repositories, or interpret section JSON directly. A section registry validates/maps payloads before rendering.

## Accessibility contracts

- `ResponsiveImage` requires meaningful alt or an explicit decorative flag.
- interactive cards have one clear linked title/media target; avoid nested links.
- galleries expose labelled previous/next controls and status; thumbnails are buttons.
- dialogs/sheets manage initial focus, focus trap, Escape, and focus return.
- form fields bind label, description, and error IDs.
- disabled booking controls expose why they are unavailable.

## Error and loading states

- Server-rendered public content should not show client loading spinners for primary content.
- Route-level `loading.tsx` skeletons reserve final dimensions.
- Admin mutations show pending state, preserve entered data on validation failure, and announce success/failure.
- Uploads show per-file progress, validation failure, retry, and finalization state.
- Empty admin lists include the next action; public empty featured grids are omitted rather than showing CMS language.

## Component tests

Test components where behavior or accessibility can regress: navigation, gallery, dialog, file uploader, repeatable form fields, booking disabled state, rich-text rendering, and validation feedback. Do not snapshot every static wrapper.
