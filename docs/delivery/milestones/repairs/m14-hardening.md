# M14 audit repair tasks

These repairs close the remaining media, backup, publication, branding, and documentation findings before the release candidate.

## Task breakdown

| Task | Finding | Title | Risk | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| M14-R1 | F04 | Protect media references during concurrent attach and delete | Medium | — | Not started |
| M14-R2 | F06 | Recover interrupted upload finalization | Medium | M14-R1 | Not started |
| M14-R3 | F05 | Produce consistent database and media backups | Medium | M14-R2 | Not started |
| M14-R4 | F10 | Preserve old published catalog URLs | Medium | — | Not started |
| M14-R5 | F11 | Make navigation publication aware | Medium | M14-R4 | Not started |
| M14-R6 | F12 | Make CMS logo settings visible in the site | Medium | — | Not started |
| M14-R7 | F14 | Synchronize current documentation status | Low | M14-R1–R6 | Not started |

## M14-R1, F04

Concurrent media attachment and deletion must preserve reference safety.

Done when an interleaving operation cannot delete a referenced asset, with a deterministic two connection integrity test.

## M14-R2, F06

Interrupted upload finalization must leave stored bytes discoverable for cleanup instead of losing the database record.

Done when interruption after object creation and before READY is recovered by a tested cleanup path.

## M14-R3, F05

Backups must represent a restorable pair of database metadata and media files during normal writes.

Done when a backup taken during controlled uploads and deletions restores with verified files and matching database references.

## M14-R4, F10

Changing a published catalog slug must preserve old links through the required redirect workflow.

Done when the old URL redirects, the new URL renders, redirect history is tested, and the public cache is correct.

## M14-R5, F11

Navigation and branch switching must not target unpublished About or Contact pages.

Done when navigation selects only published destinations and has a tested fallback for unpublished pages.

## M14-R6, F12

Saved CMS logo settings must drive the visible public and staff branding surfaces.

Done when a selected logo appears in the intended header and footer surfaces, with a browser regression test.

## M14-R7, F14

Current documentation summaries must agree with accepted implementation evidence without rewriting historical reports.

Done when the current docs identify F01, F02, and F03 as complete, remaining findings as planned or in progress, and historical audit reports remain unchanged.
