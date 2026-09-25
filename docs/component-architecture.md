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

Phase 4 built the admin dialog, sheet, disclosure menu, and toast on native `<dialog>` and plain React instead, because the platform now supplies the focus trap, inert background, and Escape handling. These live in `src/presentation/admin/ui/` and `src/presentation/admin/shell/`; see [phase-4-admin-shell.md](./phase-4-admin-shell.md#shared-patterns). Add a shadcn primitive only when a pattern needs behaviour the platform lacks, such as a combobox.

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
- `PromotionPopup` with a small client controller for dismissal/copy behavior
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
- `ActivePromotion`
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
- `PromotionTable`, `PromotionForm`, `PromotionPreview`
- `PublishControls`, `DestructiveAction`

Feature forms are Client Components only when repeatable fields, live previews, upload progress, or dirty-state handling require them. Server Actions remain the normal mutation boundary; the upload route remains an explicit HTTP boundary.

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
  PromotionPopup(active campaign, when eligible)
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
- `ActivePromotionView`: id, version, headline, body, code, terms, active window;
- `BookingView`: disabled/external/embed discriminated union.

Components never infer publication state, build storage URLs, query repositories, or interpret section JSON directly. A section registry validates/maps payloads before rendering.

## Accessibility contracts

- `ResponsiveImage` requires meaningful alt or an explicit decorative flag.
- interactive cards have one clear linked title/media target; avoid nested links.
- galleries expose labelled previous/next controls and status; thumbnails are buttons.
- dialogs/sheets manage initial focus, focus trap, Escape, and focus return.
- form fields bind label, description, and error IDs.
- disabled booking controls expose why they are unavailable.
- the promotion popup is a labelled dialog, never steals focus before it is visible, closes by button/Escape, returns focus, announces copy success/failure, and leaves the code selectable when clipboard access fails.

## Error and loading states

- Server-rendered public content should not show client loading spinners for primary content.
- Route-level `loading.tsx` skeletons reserve final dimensions.
- Admin mutations show pending state, preserve entered data on validation failure, and announce success/failure.
- Uploads show per-file progress, validation failure, retry, and finalization state.
- Promotion copy failure keeps the code visible/selectable and never blocks the page; no active campaign means no popup markup or client island.
- Empty admin lists include the next action; public empty featured grids are omitted rather than showing CMS language.

## Component tests

Test components where behavior or accessibility can regress: navigation, gallery, dialog, file uploader, repeatable form fields, booking disabled state, rich-text rendering, and validation feedback. Do not snapshot every static wrapper.
