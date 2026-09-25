# Phase 6 media management handoff

Status: **Ready for review**  
Completed: 2026-09-25  
Scope: image storage, upload verification, the media library and picker, replacement and deletion, and the reference-asset migration. Public image rendering (responsive sizes, `next/image`) is Phase 7/10.

## Outcome

Staff now manage images without touching source files. They can:

- upload JPEG, PNG, WebP, or AVIF images by drag and drop or a file picker, with per-file progress and retry;
- describe each image (alt text, caption, credit, focal point);
- see everywhere an image is used;
- place images with a keyboard-friendly picker: hero and ordered gallery (with per-use alt text) for rooms and facilities, images for page sections, sharing images for rooms, facilities, and pages, and the site's logo, compact logo, and default sharing image;
- replace an image everywhere at once;
- delete unused images, which is administrator-only; an image in use cannot be deleted.

Every upload is streamed into quarantine, identified by its bytes, fully decoded, and re-encoded before it can be served. Invalid or malicious files never become ready assets. PostgreSQL stores metadata and a relative key only; the image bytes live in a configured directory outside the application.

The 42 supplied reference images have a reviewed migration manifest. It records provenance, dimensions, checksums, intended use, rights state, and alt-text drafts:

- 33 are to import;
- 5 near-duplicates are dropped;
- 4 stock or placeholder images are excluded.

**Nothing is published with unconfirmed rights.** Content using an image whose usage rights are not confirmed cannot be published, and only administrators confirm rights.

## Decisions for the client to confirm

| Decision | Choice made | Why |
| --- | --- | --- |
| Upload policy | JPEG, PNG, WebP, or AVIF only; at most **15 MB** and **40 megapixels** (12,000 px per side) before processing; still images only; no SVG or GIF | The proposal in `security.md`. SVG can carry script; animation is not part of the design. |
| Cleaning uploads | Every upload is **re-encoded** in its own format: JPEG at quality 90 (mozjpeg), lossless PNG, WebP at 90, AVIF at 65. EXIF orientation is applied, and all metadata (camera, GPS, comments) is removed. | Removes location data and any payload hidden inside or after the image (polyglot files). The quality settings are visually lossless for photos. |
| Usage rights | Staff tick "I confirm Rivana Residence may use these images" when uploading, which stores the image as **Confirmed**. Imported reference images start **Not confirmed**. Only administrators can confirm or withdraw rights (new capability `media:rights`). | Publishing requires known rights. The supplied set's licensing is unknown, and some images look like stock photos. |
| Reference assets | The manifest excludes 4 images and drops 5 near-duplicates (see [Asset migration](#asset-migration)). The import command imports only **APPROVED** entries unless `--allow-unconfirmed` is passed, which is for staging and development. | "Keep duplicate, unlicensed, and placeholder assets unpublished" |
| Replacement | A new file is uploaded and verified first. After a confirmation that says how many places, and how many public ones, change, every reference moves in one transaction. Alt text, caption, and credit carry over if the new image has none. The old image stays in the library. | Non-destructive and reversible, as the roadmap requires |
| Deletion | Administrators only, unused images only, after a named confirmation. The record is marked deleted (so it stops being served) before the file is removed; a failed file removal is retried by cleanup. | "Clean database and object state safely when one side fails" |
| Serving | Through the application route `/media/<key>`, which serves only ready images. Headers: `nosniff`, a sandboxing CSP, same-origin resource policy, byte ranges, ETag, and a one-year immutable cache. | Works on cPanel/Passenger without a web-server alias. Replacement always creates a new key, so long caching is safe. |
| Distinct galleries | A room or facility with no gallery, or with gallery images shared with another room, shows a **Content gaps** note on its edit page. The note does not block publishing. | The reference reused one gallery for every room; the admin now makes that visible |
| Section images | Hero and Contact block: background. Text and Image-and-text: one image. Gallery: ordered images. Other sections: none. | Taken from the content model's media roles |
| Favicon | Not managed in the admin | It needs multi-size ICO/PNG output; it will be handled with the build in Phase 10 |

## Storage configuration, permissions, and backup

```text
Hosting.com account (paths redacted)
├── <releases>/<release-id>/          application code (replaced on each deploy)
└── <media-root>/                     MEDIA_STORAGE_ROOT, outside every release; mode 750
    ├── quarantine/<uploadId>.upload  unverified bytes; never served; removed after verify or by cleanup
    └── images/<yyyy>/<mm>/<id>.<ext> verified, re-encoded objects; mode 640; never overwritten
                                      served only via /media/<key> when the database says READY

PostgreSQL (MediaAsset)               relative storageKey + metadata; no binaries, no absolute paths
Backups                               nightly off-server copy of <media-root>/images + database dump;
                                      restore = copy files back with the same keys (checksums in DB)
Cron (hourly)                         npm run media -- cleanup
```

**Safeguards in the local adapter** (`src/infrastructure/media/local-media-storage.ts`):

- The root must be absolute, is canonicalized, and in production must lie **outside the application directory**; startup fails otherwise.
- Keys are server-generated (`images/2026/09/<cuid>.webp`), checked against an allowlist pattern in code and by a database CHECK constraint, and re-resolved to stay inside the root.
- Every directory between the root and a file is checked with `lstat`, and directories are created **one segment at a time**, so a planted symlink cannot redirect a read, write, create, or delete outside the root. Files are opened with `O_NOFOLLOW`.
- Quarantine writes use exclusive create and stop reading as soon as the 15 MB cap is exceeded.
- Final objects are written to a private temporary file, then atomically **hard-linked** into place. `link()` fails if the key already exists, so no object is ever overwritten.

**Still open for deployment (Phase 12):** the roadmap's prerequisite asked for the Hosting.com media root, quota, serving method, and off-server backup to be verified over SSH. I did not access the server in this phase. The design follows the read-only preflight in [hosting-preflight.md](./hosting-preflight.md), which found about 4 GB used, 70k of 600k inodes, and rsync and cron available. Provisioning the directory and backup target, and running a restore drill, remain launch tasks.

## Upload verification and threat-test results

The pipeline (`src/application/media/ingest-image.ts`) is shared by staff uploads and the importer:

1. Check the declared name, type, and size.
2. Record a PENDING asset and stream the bytes into quarantine (capped).
3. Check magic bytes, then decode the header and check it against the declared type, dimensions, and page count.
4. Fully decode and re-encode.
5. Hash the result (SHA-256) and refuse duplicates.
6. Store the object under a new key and mark the asset READY.

Any failure marks the asset FAILED with a readable reason and removes the quarantined bytes.

| Threat or case | Result | Test |
| --- | --- | --- |
| Valid JPEG, PNG, WebP, and AVIF | Accepted, re-encoded, served | integration |
| Camera and GPS metadata (EXIF) | Stripped from the stored file | integration |
| Script or ZIP appended after the image (polyglot) | Not present in the stored file | integration |
| PNG content named `.jpg` / `image/jpeg` | Rejected: "contents do not match" | integration |
| GIF or HTML content named as an image | Rejected: not a readable image | integration, E2E |
| SVG upload; `photo.png.exe` | Rejected before anything is stored | integration, unit |
| Truncated or corrupt JPEG | Rejected on full decode | integration |
| Animated WebP (and animated AVIF brand `avis`) | Rejected | integration, unit |
| Decompression bomb (PNG header claiming 60,000 × 60,000) | Rejected from the header, before any pixels are decoded | integration |
| Over 40 MP, over 12,000 px per side, under 16 px | Rejected | integration, unit |
| Over 15 MB (declared or streamed) | 413 at the route; quarantine stops at the cap | integration |
| Empty file | Rejected | integration |
| Duplicate image | Refused with a link to the existing image; nothing left behind | integration |
| Path traversal, absolute, or dotted keys; the quarantine prefix | Refused by storage and served as 404 | unit (storage contract), E2E |
| Symlinked directory, symlinked object, or symlinked quarantine | Refused; nothing created outside the root | unit |
| Object overwrite | Refused (`EEXIST`) | unit (storage contract) |
| Storage failure mid-upload | FAILED, no object, quarantine cleaned | integration |
| Retry and idempotency | Finalization is idempotent; a failed upload can be retried | integration, E2E |
| Signed-out upload | Redirected to login (proxy) or 401 | E2E |
| Cross-site upload (CSRF) | 403 unless `Origin` matches `APP_URL` and `Sec-Fetch-Site` is same-origin | unit; confirmed with curl (below) |
| Editor deleting media or confirming rights | 403 (`FORBIDDEN`); no buttons shown | integration, E2E |
| Serving a FAILED, PENDING, or DELETED asset | 404 | integration, E2E |

Cross-site check against the production build:

```text
curl -X POST -H "Origin: https://evil.example" -H "Content-Type: image/png" \
     -H "Cookie: <session>" --data-binary x http://127.0.0.1:3100/admin/media/upload
→ 403 {"message":"Uploads must come from the admin."}
```

Playwright's API client drops the `Secure` session cookie over plain HTTP, so the signed-in cross-site case is covered by a unit test of the origin check rather than E2E.

## Asset migration

- `media-import/curation.json`: my review of each supplied file (intended use, alt-text draft, exclusion reason, and which reference pages used it).
- `media-import/reference-manifest.json`: generated by `npm run media -- manifest`. It adds SHA-256, dimensions, byte size, format, near-duplicate detection (64-bit difference hash, at most 6 differing bits), the decision, and the rights state.

| Decision | Count | Files |
| --- | --: | --- |
| IMPORT | 33 | about ×2, gym (hero + 4 gallery), home hero, pool (hero + 3 gallery), 3 logo PNGs, 3 room heroes, 8 studio-gallery images, 7 unused "superior" room photos |
| DUPLICATE | 5 | `gym-02` → `gym-gallery-01`, `gym-03` → `gym-gallery-02`, `pool-02` → `pool-gallery-01`, `room-superior-0` → `room-pool`, `room-superior-2` → `room-double` (the copy the reference pages used is kept) |
| EXCLUDED | 4 | `amenity-fitness`, `amenity-pool`, `amenity-spa` (stock-style photos paired with placeholder text in the reference) and `pool-gallery-03` (appears to be a different pool) |

All 42 entries are **UNCONFIRMED** until the client confirms ownership or licence for each. Alt text is a draft for staff to review.

Content gap to note: only the "Studio with balcony" room had its own gallery in the reference. The other two rooms had a hero image only, and the admin shows this as a content gap.

Import run against the E2E database:

| Command | Result |
| --- | --- |
| `npm run media -- import` | 0 imported; 42 skipped (no rights approved yet) |
| `npm run media -- import --allow-unconfirmed` | 33 imported; 9 skipped (duplicates and exclusions) |
| The same command again | 33 already imported; nothing new |
| `npm run media -- cleanup` | Nothing to fix |

## Architecture

```text
src/domain/media/media-asset.ts            policy, magic bytes, declaration/decoded checks, keys, details, section slots
src/application/ports/providers.ts         MediaStorage (redesigned), ImageProcessor, Hasher
src/application/media/                     ingest-image, media-library, cleanup-media, import-reference-assets
src/infrastructure/media/                  local-media-storage, sharp-image-processor, node-hasher
src/infrastructure/db/prisma/repositories/media-repository.ts   lifecycle, usage, replace, delete, cleanup
src/composition/media.ts                   wiring, origin check, public serving
src/app/admin/(protected)/media/…          library, image detail, upload route, actions
src/app/media/[...key]/route.ts            public delivery of READY images only
src/presentation/admin/media/              uploader, grid, details/focal form, picker, image choices, forms
scripts/media.mts                          manifest | import | cleanup
```

`MediaStorage` exposes provider-neutral operations only: quarantine write, read, list, and discard; put; open with an optional range; and delete. No `fs`, path, or SDK type crosses it, and sharp stays inside `SharpImageProcessor`. The storage contract tests in `tests/support/media-storage-contract.ts` are written for any adapter; a future S3-compatible adapter must pass them unchanged.

The migration `20260925170034_media_library` adds:

- `MediaAsset.rightsStatus` (default UNCONFIRMED);
- `sourceReference` (provenance) and `failureReason`;
- `SiteSettings.defaultOgMediaId`;
- a CHECK constraint that allows only safe storage-key characters.

## Bugs found and fixed during this phase

- **A planted symlink could make the store create a directory outside the media root.** `put` ran a recursive `mkdir` before checking for links. The write itself was refused, but a stray directory landed outside. Directories are now created one segment at a time with `lstat` checks, and a containment test covers this.
- **Some forms showed their success toast twice.** `useUnsavedChanges` returned new function identities on every render, so each form's success effect ran again. This affected the Phase 5 forms too. The callbacks are now stable, and a regression test covers it.
- **Screen readers heard "Removehero image".** A line break swallowed the space before visually hidden text. The media buttons now use explicit `aria-label`s.
- **The build traced the whole project** because of dynamic filesystem paths in the media composition. Turbopack's ignore annotation removes this, and the build has no warnings.
- **Form spacing:** nested image fieldsets had no gap between them. A stacked wrapper fixes it.

## Changed behaviour from earlier phases

- The `MediaStorage` port was redesigned for streamed quarantine uploads and non-overwriting puts. No adapter existed before.
- Room, facility, and page publishing now also requires every image to have **confirmed rights**. Page publishing checks section images (ready, and alt text unless decorative).
- The Phase 5 image dropdown is replaced by the picker, with a hero alt override, gallery ordering, and a sharing image.
- The capability matrix gained `media:rights` (administrator). `docs/phase-3-auth.md` has been updated.
- Test helpers create images with confirmed rights, like a staff upload.

## Verification

| Check | Result |
| --- | --- |
| `npm run check` (format, lint, typecheck, unit, build) | Pass, with no build warnings |
| Unit and component tests | 31 files, 413 tests pass (83 new, including the storage contract) |
| Integration tests (PostgreSQL, real sharp, real filesystem) | 11 files, 147 tests pass (34 new) |
| E2E (desktop and mobile Chromium, production build) | 57 passed. 13 were skipped by design: single-project flows, including administrator media management, which runs once on desktop. |

E2E coverage:

- upload with rights confirmation and progress;
- a rejected upload with its reason and a retry button;
- editing alt text and focal point;
- attaching images through the keyboard picker;
- gallery reordering;
- replacement with confirmation;
- blocked deletion of an image in use, and deletion of an unused one;
- public delivery headers, byte ranges, ETag 304, and 404 for traversal and unknown keys;
- signed-out uploads refused;
- editors see no delete or rights controls.

axe reports no violations on the library, image detail, and room image pages.

Accessibility: drag and drop is an enhancement, and the "Choose images" button and file input are the primary path. Each file shows a labelled `<progress>`, and each upload's start, finish, and failure is announced once. Picker choices are native radio buttons and checkboxes inside a modal `<dialog>` with search focused first. The focal point has numeric inputs, and clicking the image is only a pointer shortcut. Gallery moves are announced and keep focus.

Screenshots in `docs/screenshots/`:

- `phase-6-library-desktop.png` and `phase-6-library-mobile.png`
- `phase-6-upload-results-desktop.png` (an accepted file and a rejected one)
- `phase-6-image-details-in-use-desktop.png` (in use, so deletion is blocked; replace panel)
- `phase-6-image-rights-unconfirmed-desktop.png`
- `phase-6-picker-dialog-desktop.png`
- `phase-6-facility-images-desktop.png`
- `phase-6-section-images-desktop.png`
- `phase-6-settings-brand-images-desktop.png`
- `phase-6-room-content-gaps-desktop.png`

## Migrations, configuration, and environment

- Migration `20260925170034_media_library` (above).
- `MEDIA_STORAGE_ROOT` is unchanged: it is required in production and must be absolute and outside the app. Development defaults to `<tmp>/rivana-media-dev`, and E2E uses `/tmp/rivana-e2e-media`, which is reset on every run.
- New dependency: `sharp@0.35.4`, pinned. It was already installed through Next.js, which uses it for image optimization.
- New command: `npm run media -- manifest | import [--allow-unconfirmed] | cleanup`. Schedule `cleanup` hourly in production.

## Known limitations and follow-ups

- **Production media root, quota monitoring, and off-server backup** are not provisioned or verified yet (see [Storage configuration](#storage-configuration-permissions-and-backup)).
- **No resized variants** are generated. Public pages will use `next/image` (Phase 7/10) for responsive sizes, and objects are stored at their uploaded resolution.
- **The signed-in cross-site upload case** is unit-tested and was checked with curl, but it is not covered in E2E (see [Upload verification](#upload-verification-and-threat-test-results)).
- **Animated PNG (APNG)** decodes as its first frame and is stored still; this is not rejected explicitly.
- **Bulk delete** is deferred, as the design allows.
- **Every reference image's rights** must be confirmed by the client before any content using it can be published.

## Reviewer decision

Awaiting client review. Approve the media behaviour (upload policy, re-encoding, rights model, replacement, and deletion) and the migrated asset set, including the exclusions and duplicates above and confirmation of the reference images' rights, before the public compositions are built. Phase 7 has not started.
