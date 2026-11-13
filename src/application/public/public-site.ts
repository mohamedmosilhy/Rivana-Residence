import type { BranchRepository, BranchRow } from "@/application/branches";
import type {
  FacilityRepository,
  PageRepository,
  RoomRepository,
} from "@/application/content/ports";
import type { MediaRepository } from "@/application/media/ports";
import type { SettingsRepository } from "@/application/settings/ports";
import type { PageKey } from "@/domain/content/page-sections";

import {
  publicBranch,
  publicFacility,
  publicImage,
  publicPage,
  publicRoom,
  publicSettings,
  type PublicBranch,
} from "./view-models";

/**
 * Read-only queries for visitors. Every method returns published content
 * only, as serializable view models, so results can be cached under content
 * tags and passed to client components.
 *
 * Content reads take a branch id the server resolved from the URL with
 * `branch(slug)` (spec 0002); a client value is never used as an id. Only
 * ACTIVE branches are visible.
 */
export class PublicSite {
  constructor(
    private readonly deps: Readonly<{
      settings: SettingsRepository;
      media: MediaRepository;
      pages: PageRepository;
      rooms: RoomRepository;
      facilities: FacilityRepository;
      branches: BranchRepository;
    }>,
  ) {}

  private async image(id: string | null) {
    if (!id) return null;
    const asset = await this.deps.media.findAdminById(id);
    return asset
      ? publicImage({
          ...asset,
          altOverride: null,
          rightsConfirmed: asset.rightsStatus === "CONFIRMED",
        })
      : null;
  }

  async settings() {
    const settings = await this.deps.settings.getPublic();
    if (!settings) return null;
    const [logo, favicon, share] = await Promise.all([
      this.image(settings.logoMediaId),
      this.image(settings.faviconMediaId),
      this.image(settings.defaultOgMediaId),
    ]);
    return publicSettings(settings, logo, favicon, share);
  }

  private async toPublic(rows: readonly BranchRow[]) {
    const flags = await this.deps.branches.catalogFlags(
      rows.map((row) => row.id),
    );
    return Promise.all(
      rows.map(async (row) =>
        publicBranch(
          row,
          flags.find((flag) => flag.branchId === row.id),
          await this.image(row.heroMediaId),
        ),
      ),
    );
  }

  /** Active branches by display order: chooser, switcher, sitemap. */
  async activeBranches(): Promise<readonly PublicBranch[]> {
    return this.toPublic(await this.deps.branches.listActiveRows());
  }

  /** The active branch with this slug; null when unknown or inactive. */
  async branch(slug: string): Promise<PublicBranch | null> {
    const row = await this.deps.branches.findActiveRowBySlug(slug);
    return row ? ((await this.toPublic([row]))[0] ?? null) : null;
  }

  async page(branchId: string, key: PageKey) {
    const page = await this.deps.pages.findPublishedByKey(branchId, key);
    return page ? publicPage(page, await this.image(page.ogMediaId)) : null;
  }

  async rooms(branchId: string) {
    return (await this.deps.rooms.listPublished(branchId)).map((room) =>
      publicRoom(room),
    );
  }

  async room(branchId: string, slug: string) {
    const room = await this.deps.rooms.findPublishedBySlug(branchId, slug);
    return room ? publicRoom(room, await this.image(room.ogMediaId)) : null;
  }

  async facilities(branchId: string) {
    return (await this.deps.facilities.listPublished(branchId)).map(
      (facility) => publicFacility(facility),
    );
  }

  async facility(branchId: string, slug: string) {
    const facility = await this.deps.facilities.findPublishedBySlug(
      branchId,
      slug,
    );
    return facility
      ? publicFacility(facility, await this.image(facility.ogMediaId))
      : null;
  }
}
