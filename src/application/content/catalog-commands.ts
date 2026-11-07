import { authorize } from "@/application/auth/authorize";
import type { StaffPrincipal } from "@/application/auth/ports";
import type { BranchRepository } from "@/application/branches";
import { CACHE_TAGS } from "@/application/cache/cache-tags";
import type { CacheInvalidator } from "@/application/ports/providers";
import type { EntityMediaSelection } from "@/application/content/catalog-forms";
import type { Actor, MediaAssignment } from "@/application/ports/repositories";
import { failure, success, type Result } from "@/application/shared/result";
import type { Capability } from "@/domain/auth/capabilities";
import type { PublicationStatus } from "@/domain/shared/types";

type CatalogRecord = Readonly<{
  id: string;
  branchId: string;
  slug: string;
  status: PublicationStatus;
  /** Rooms only: a change alters the branch's stay label. */
  accommodationType?: string;
}>;

/** The shared shape of the room and facility repositories. */
export interface CatalogRepository<Dto extends CatalogRecord, Input> {
  listAdmin(branchId: string): Promise<readonly Dto[]>;
  findAdminById(id: string): Promise<Dto | null>;
  create(branchId: string, input: Input, actor: Actor): Promise<Result<Dto>>;
  update(id: string, input: Input, actor: Actor): Promise<Result<Dto>>;
  publish(id: string, actor: Actor): Promise<Result<Dto>>;
  unpublish(id: string, actor: Actor): Promise<Result<Dto>>;
  archive(id: string, actor: Actor): Promise<Result<void>>;
  restore(id: string, actor: Actor): Promise<Result<Dto>>;
  delete(id: string, actor: Actor): Promise<Result<void>>;
  reorder(
    branchId: string,
    orderedIds: readonly string[],
    actor: Actor,
  ): Promise<Result<void>>;
  replaceMedia(
    id: string,
    media: readonly MediaAssignment[],
    actor: Actor,
  ): Promise<Result<Dto>>;
  setSocialImage(
    id: string,
    mediaId: string | null,
    actor: Actor,
  ): Promise<Result<Dto>>;
}

export type CatalogKind = Readonly<{
  /** Lower-case noun for messages, e.g. "room". */
  noun: string;
  listTag: (branchSlug: string) => string;
  itemTag: (branchSlug: string, slug: string) => string;
}>;

export const ROOM_KIND: CatalogKind = {
  noun: "room",
  listTag: CACHE_TAGS.stay,
  itemTag: CACHE_TAGS.stayItem,
};

export const FACILITY_KIND: CatalogKind = {
  noun: "facility",
  listTag: CACHE_TAGS.facilities,
  itemTag: CACHE_TAGS.facility,
};

export const NO_BRANCH_MESSAGE = "No branch exists. Run the seed.";
export const CHOOSE_BRANCH_MESSAGE = "Choose a branch.";

/**
 * Staff commands for rooms and facilities: authorization, friendly conflict
 * messages, and precise cache invalidation. Drafts never invalidate public
 * tags; only changes that alter what visitors can see do.
 */
export class CatalogCommands<Dto extends CatalogRecord, Input> {
  constructor(
    private readonly repository: CatalogRepository<Dto, Input>,
    private readonly cache: CacheInvalidator,
    private readonly kind: CatalogKind,
    private readonly branches: BranchRepository,
  ) {}

  /**
   * New records join the branch chosen on the form. The posted slug is
   * re-resolved here and never trusted as an id (spec 0002). A record's
   * branch is fixed after creation.
   */
  async create(
    staff: StaffPrincipal | null,
    branchSlug: string | null,
    input: Input,
  ) {
    const access = authorize(staff, "content:edit");
    if (!access.ok) return access;
    const branch = branchSlug
      ? await this.branches.findBySlug(branchSlug)
      : null;
    if (!branch) {
      return failure("VALIDATION", CHOOSE_BRANCH_MESSAGE, {
        branch: [CHOOSE_BRANCH_MESSAGE],
      });
    }
    return this.slugConflict(
      await this.repository.create(branch.id, input, access.value),
    );
  }

  async update(staff: StaffPrincipal | null, id: string, input: Input) {
    return this.mutate(staff, "content:edit", id, async (actor, before) => {
      const result = this.slugConflict(
        await this.repository.update(id, input, actor),
      );
      if (!result.ok || before.status !== "PUBLISHED") return result;
      await this.invalidatePublic(
        before.branchId,
        [before.slug, result.value.slug],
        before.accommodationType !== result.value.accommodationType,
      );
      return result;
    });
  }

  async publish(staff: StaffPrincipal | null, id: string) {
    return this.mutate(staff, "content:publish", id, async (actor, before) => {
      const result = await this.repository.publish(id, actor);
      if (result.ok) {
        await this.invalidatePublic(before.branchId, [before.slug], true);
      }
      return result;
    });
  }

  async unpublish(staff: StaffPrincipal | null, id: string) {
    return this.mutate(staff, "content:publish", id, async (actor, before) => {
      const result = await this.repository.unpublish(id, actor);
      if (result.ok) {
        await this.invalidatePublic(before.branchId, [before.slug], true);
      }
      return result;
    });
  }

  async archive(staff: StaffPrincipal | null, id: string) {
    return this.mutate(staff, "content:archive", id, async (actor, before) => {
      const result = await this.repository.archive(id, actor);
      if (result.ok && before.status === "PUBLISHED") {
        await this.invalidatePublic(before.branchId, [before.slug], true);
      }
      return result;
    });
  }

  async restore(staff: StaffPrincipal | null, id: string) {
    return this.mutate(staff, "content:archive", id, (actor) =>
      this.repository.restore(id, actor),
    );
  }

  /** Permanent deletion: administrators only, archived records only. */
  async delete(staff: StaffPrincipal | null, id: string) {
    return this.mutate(staff, "content:delete", id, (actor) =>
      this.repository.delete(id, actor),
    );
  }

  /**
   * Swaps a record with its neighbour in its branch's active (non-archived)
   * order.
   */
  async move(staff: StaffPrincipal | null, id: string, offset: -1 | 1) {
    const access = authorize(staff, "content:edit");
    if (!access.ok) return access;
    const record = await this.repository.findAdminById(id);
    if (!record) {
      return failure("NOT_FOUND", `This ${this.kind.noun} cannot be moved.`);
    }
    const active = (await this.repository.listAdmin(record.branchId)).filter(
      (item) => item.status !== "ARCHIVED",
    );
    const index = active.findIndex((record) => record.id === id);
    const target = index + offset;
    if (index < 0) {
      return failure("NOT_FOUND", `This ${this.kind.noun} cannot be moved.`);
    }
    if (target < 0 || target >= active.length) return success(undefined);

    const order = active.map((record) => record.id);
    [order[index], order[target]] = [order[target]!, order[index]!];
    const result = await this.repository.reorder(
      record.branchId,
      order,
      access.value,
    );
    if (result.ok) {
      const branchSlug = await this.branchSlug(record.branchId);
      await this.cache.invalidate([
        ...(branchSlug ? [this.kind.listTag(branchSlug)] : []),
        CACHE_TAGS.sitemap,
      ]);
    }
    return result;
  }

  async replaceMedia(
    staff: StaffPrincipal | null,
    id: string,
    media: readonly MediaAssignment[],
  ) {
    return this.mutate(staff, "content:edit", id, async (actor, before) => {
      const result = await this.repository.replaceMedia(id, media, actor);
      if (result.ok && before.status === "PUBLISHED") {
        await this.invalidatePublic(before.branchId, [before.slug]);
      }
      return result;
    });
  }

  /** Saves the hero, gallery, and sharing image together. */
  async saveImages(
    staff: StaffPrincipal | null,
    id: string,
    selection: EntityMediaSelection,
  ) {
    return this.mutate(staff, "content:edit", id, async (actor, before) => {
      const media = await this.repository.replaceMedia(
        id,
        selection.assignments,
        actor,
      );
      if (!media.ok) return media;
      const result = await this.repository.setSocialImage(
        id,
        selection.socialImageId,
        actor,
      );
      if (before.status === "PUBLISHED") {
        await this.invalidatePublic(before.branchId, [before.slug]);
      }
      return result;
    });
  }

  private async mutate<T>(
    staff: StaffPrincipal | null,
    capability: Capability,
    id: string,
    operation: (actor: StaffPrincipal, before: Dto) => Promise<Result<T>>,
  ): Promise<Result<T>> {
    const access = authorize(staff, capability);
    if (!access.ok) return access;
    const before = await this.repository.findAdminById(id);
    if (!before) {
      return failure("NOT_FOUND", `This ${this.kind.noun} no longer exists.`);
    }
    return operation(access.value, before);
  }

  private async branchSlug(branchId: string) {
    return (await this.branches.findById(branchId))?.slug ?? null;
  }

  /**
   * Expires the branch's list and item tags plus the sitemap. Publish-state
   * and type changes also expire `branches`, whose view models carry each
   * branch's published listing types and facility flag (spec 0002).
   */
  private async invalidatePublic(
    branchId: string,
    slugs: readonly string[],
    catalogShapeChanged = false,
  ) {
    const branchSlug = await this.branchSlug(branchId);
    if (!branchSlug) return;
    await this.cache.invalidate([
      this.kind.listTag(branchSlug),
      ...[...new Set(slugs)].map((slug) => this.kind.itemTag(branchSlug, slug)),
      // Public edits also change sitemap lastmod and possibly its image list.
      CACHE_TAGS.sitemap,
      ...(catalogShapeChanged ? [CACHE_TAGS.branches] : []),
    ]);
  }

  private slugConflict(result: Result<Dto>): Result<Dto> {
    if (result.ok || result.error.code !== "CONFLICT") return result;
    return failure(
      "CONFLICT",
      `Another ${this.kind.noun} uses this web address.`,
      {
        slug: [
          `Another ${this.kind.noun} already uses this web address. Choose a different one.`,
        ],
      },
    );
  }
}
