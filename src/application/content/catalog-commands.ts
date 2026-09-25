import { authorize } from "@/application/auth/authorize";
import type { StaffPrincipal } from "@/application/auth/ports";
import { CACHE_TAGS } from "@/application/cache/cache-tags";
import type { CacheInvalidator } from "@/application/ports/providers";
import type { Actor, MediaAssignment } from "@/application/ports/repositories";
import { failure, success, type Result } from "@/application/shared/result";
import type { Capability } from "@/domain/auth/capabilities";
import type { PublicationStatus } from "@/domain/shared/types";

type CatalogRecord = Readonly<{
  id: string;
  slug: string;
  status: PublicationStatus;
}>;

/** The shared shape of the room and facility repositories. */
export interface CatalogRepository<Dto extends CatalogRecord, Input> {
  listAdmin(): Promise<readonly Dto[]>;
  findAdminById(id: string): Promise<Dto | null>;
  create(input: Input, actor: Actor): Promise<Result<Dto>>;
  update(id: string, input: Input, actor: Actor): Promise<Result<Dto>>;
  publish(id: string, actor: Actor): Promise<Result<Dto>>;
  unpublish(id: string, actor: Actor): Promise<Result<Dto>>;
  archive(id: string, actor: Actor): Promise<Result<void>>;
  restore(id: string, actor: Actor): Promise<Result<Dto>>;
  delete(id: string, actor: Actor): Promise<Result<void>>;
  reorder(orderedIds: readonly string[], actor: Actor): Promise<Result<void>>;
  replaceMedia(
    id: string,
    media: readonly MediaAssignment[],
    actor: Actor,
  ): Promise<Result<Dto>>;
}

export type CatalogKind = Readonly<{
  /** Lower-case noun for messages, e.g. "room". */
  noun: string;
  listTag: string;
  itemTag: (slug: string) => string;
}>;

export const ROOM_KIND: CatalogKind = {
  noun: "room",
  listTag: CACHE_TAGS.rooms,
  itemTag: CACHE_TAGS.room,
};

export const FACILITY_KIND: CatalogKind = {
  noun: "facility",
  listTag: CACHE_TAGS.facilities,
  itemTag: CACHE_TAGS.facility,
};

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
  ) {}

  async create(staff: StaffPrincipal | null, input: Input) {
    const access = authorize(staff, "content:edit");
    if (!access.ok) return access;
    return this.slugConflict(await this.repository.create(input, access.value));
  }

  async update(staff: StaffPrincipal | null, id: string, input: Input) {
    return this.mutate(staff, "content:edit", id, async (actor, before) => {
      const result = this.slugConflict(
        await this.repository.update(id, input, actor),
      );
      if (!result.ok || before.status !== "PUBLISHED") return result;
      const renamed = before.slug !== result.value.slug;
      await this.invalidatePublic([before.slug, result.value.slug], renamed);
      return result;
    });
  }

  async publish(staff: StaffPrincipal | null, id: string) {
    return this.mutate(staff, "content:publish", id, async (actor, before) => {
      const result = await this.repository.publish(id, actor);
      if (result.ok) await this.invalidatePublic([before.slug]);
      return result;
    });
  }

  async unpublish(staff: StaffPrincipal | null, id: string) {
    return this.mutate(staff, "content:publish", id, async (actor, before) => {
      const result = await this.repository.unpublish(id, actor);
      if (result.ok) await this.invalidatePublic([before.slug]);
      return result;
    });
  }

  async archive(staff: StaffPrincipal | null, id: string) {
    return this.mutate(staff, "content:archive", id, async (actor, before) => {
      const result = await this.repository.archive(id, actor);
      if (result.ok && before.status === "PUBLISHED") {
        await this.invalidatePublic([before.slug]);
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

  /** Swaps a record with its neighbour in the active (non-archived) order. */
  async move(staff: StaffPrincipal | null, id: string, offset: -1 | 1) {
    const access = authorize(staff, "content:edit");
    if (!access.ok) return access;
    const active = (await this.repository.listAdmin()).filter(
      (record) => record.status !== "ARCHIVED",
    );
    const index = active.findIndex((record) => record.id === id);
    const target = index + offset;
    if (index < 0) {
      return failure("NOT_FOUND", `This ${this.kind.noun} cannot be moved.`);
    }
    if (target < 0 || target >= active.length) return success(undefined);

    const order = active.map((record) => record.id);
    [order[index], order[target]] = [order[target]!, order[index]!];
    const result = await this.repository.reorder(order, access.value);
    if (result.ok) await this.cache.invalidate([this.kind.listTag]);
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
        await this.invalidatePublic([before.slug]);
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

  private async invalidatePublic(slugs: readonly string[], sitemap = true) {
    await this.cache.invalidate([
      this.kind.listTag,
      ...[...new Set(slugs)].map(this.kind.itemTag),
      // Only a new, removed, or renamed public URL changes the sitemap.
      ...(sitemap ? [CACHE_TAGS.sitemap] : []),
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
