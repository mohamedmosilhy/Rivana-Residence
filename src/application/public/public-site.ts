import type { BranchRepository } from "@/application/branches";
import type {
  FacilityRepository,
  MediaRepository,
  PageRepository,
  PromotionRepository,
  RoomRepository,
  SettingsRepository,
} from "@/application/ports/repositories";
import type { PageKey } from "@/domain/content/page-sections";
import { selectActivePromotion } from "@/domain/promotions/promotion";

import {
  publicFacility,
  publicImage,
  publicPage,
  publicPromotionCandidate,
  publicRoom,
  publicSettings,
  type PublicPromotion,
  type PublicPromotionCandidate,
} from "./view-models";

/**
 * Read-only queries for visitors. Every method returns published content
 * only, as serializable view models, so results can be cached under content
 * tags and passed to client components. Content comes from the default
 * active branch (the only branch until branch websites arrive in M5); with
 * no active branch every query returns the same empty result as unpublished
 * content.
 */
export class PublicSite {
  constructor(
    private readonly deps: Readonly<{
      settings: SettingsRepository;
      media: MediaRepository;
      pages: PageRepository;
      rooms: RoomRepository;
      facilities: FacilityRepository;
      promotions: PromotionRepository;
      branches: BranchRepository;
    }>,
  ) {}

  private async branchId() {
    return (await this.deps.branches.findDefaultActive())?.id ?? null;
  }

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

  async page(key: PageKey) {
    const branchId = await this.branchId();
    if (!branchId) return null;
    const page = await this.deps.pages.findPublishedByKey(branchId, key);
    return page ? publicPage(page, await this.image(page.ogMediaId)) : null;
  }

  async rooms() {
    const branchId = await this.branchId();
    if (!branchId) return [];
    return (await this.deps.rooms.listPublished(branchId)).map((room) =>
      publicRoom(room),
    );
  }

  async room(slug: string) {
    const branchId = await this.branchId();
    if (!branchId) return null;
    const room = await this.deps.rooms.findPublishedBySlug(branchId, slug);
    return room ? publicRoom(room, await this.image(room.ogMediaId)) : null;
  }

  async facilities() {
    const branchId = await this.branchId();
    if (!branchId) return [];
    return (await this.deps.facilities.listPublished(branchId)).map(
      (facility) => publicFacility(facility),
    );
  }

  async facility(slug: string) {
    const branchId = await this.branchId();
    if (!branchId) return null;
    const facility = await this.deps.facilities.findPublishedBySlug(
      branchId,
      slug,
    );
    return facility
      ? publicFacility(facility, await this.image(facility.ogMediaId))
      : null;
  }

  /**
   * Published pop-up campaigns that have not ended. Cheap to cache: the
   * winner is chosen per request with `activePromotion`, so start and end
   * times are honoured exactly even while this list is cached.
   */
  async promotionCandidates(now: Date) {
    return (await this.deps.promotions.listPublishedPopups(now)).map(
      publicPromotionCandidate,
    );
  }
}

/** Applies the public selection rule at request time (server clock). */
export function activePromotion(
  candidates: readonly PublicPromotionCandidate[],
  now: Date,
): PublicPromotion | null {
  const winner = selectActivePromotion(
    candidates.map((candidate) => ({
      ...candidate,
      status: "PUBLISHED" as const,
      showAsPopup: true,
      startsAt: candidate.startsAt ? new Date(candidate.startsAt) : null,
      endsAt: candidate.endsAt ? new Date(candidate.endsAt) : null,
      publishedAt: candidate.publishedAt
        ? new Date(candidate.publishedAt)
        : null,
    })),
    now,
  );
  if (!winner) return null;
  const { id, version, headline, body, code, terms } = winner;
  return { id, version, headline, body, code, terms };
}
