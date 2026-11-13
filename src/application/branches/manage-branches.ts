import { authorize } from "@/application/auth/authorize";
import type { StaffPrincipal } from "@/application/auth/ports";
import { CACHE_TAGS } from "@/application/cache/cache-tags";
import type { CacheInvalidator } from "@/application/cache/ports";
import type { Clock } from "@/application/shared/providers";
import {
  failure,
  invalid,
  success,
  type Result,
} from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import {
  DEFAULT_BRANCH_DEACTIVATION_MESSAGE,
  DEFAULT_BRANCH_SLUG,
  branchCreateSchema,
  branchCrossFieldIssues,
  parseBranchUpdate,
  type BranchUpdateAttributes,
} from "@/domain/branches";
import {
  REQUIRED_PAGES,
  defaultPageSections,
} from "@/domain/content/default-sections";
import { PAGE_KEYS } from "@/domain/content/page-sections";
import { issuesFromZod } from "@/domain/shared/domain-error";

import type { BranchRepository, BranchRow } from "./ports";

/** Whether an id names a ready, undeleted library image. */
export interface BranchMediaCheck {
  isUsableImage(id: string): Promise<boolean>;
}

const SLUG_TAKEN = "That web address is already used by another branch.";
const HERO_UNUSABLE = "Choose a ready image from the media library.";
const NOT_FOUND = "This branch no longer exists.";

/**
 * Branch administration (API-A2, API-A3, and the branch screens; spec 0002).
 * Admin only (`branches:manage`). Every write is audited in its own
 * transaction and expires the branch's public cache tags.
 */
export class ManageBranches {
  constructor(
    private readonly deps: Readonly<{
      branches: BranchRepository;
      cache: CacheInvalidator;
      media: BranchMediaCheck;
      clock: Clock;
    }>,
  ) {}

  async list(staff: StaffPrincipal | null) {
    const access = authorize(staff, "branches:manage");
    if (!access.ok) return access;
    return success(await this.deps.branches.listRows());
  }

  async get(
    staff: StaffPrincipal | null,
    id: string,
  ): Promise<Result<BranchRow | null>> {
    const access = authorize(staff, "branches:manage");
    if (!access.ok) return access;
    return success(await this.deps.branches.findRowById(id));
  }

  async create(
    staff: StaffPrincipal | null,
    input: unknown,
  ): Promise<Result<BranchRow>> {
    const access = authorize(staff, "branches:manage");
    if (!access.ok) return access;
    const parsed = branchCreateSchema.safeParse(input);
    if (!parsed.success) {
      return invalid(
        "Some branch details need attention.",
        issuesFromZod(parsed.error.issues),
      );
    }
    const hero = await this.checkHero(parsed.data.heroMediaId);
    if (!hero.ok) return hero;

    const pages = REQUIRED_PAGES.map((page) => ({
      ...page,
      sections: defaultPageSections(page.key, parsed.data.name),
    }));
    const result = await this.deps.branches.create(
      parsed.data,
      pages,
      (branchId) =>
        auditEvent({
          occurredAt: this.deps.clock.now(),
          actorType: "STAFF",
          actorId: access.value.id,
          action: "branch.created",
          entityType: "Branch",
          entityId: branchId,
          branchId,
          reason: null,
          changes: {
            slug: parsed.data.slug,
            name: parsed.data.name,
            status: parsed.data.status,
          },
        }),
    );
    if (!result.ok) {
      return result.error.code === "CONFLICT"
        ? failure("CONFLICT", SLUG_TAKEN, { slug: [SLUG_TAKEN] })
        : result;
    }
    await this.deps.cache.invalidate([CACHE_TAGS.branches, CACHE_TAGS.sitemap]);
    return result;
  }

  async update(
    staff: StaffPrincipal | null,
    id: string,
    input: unknown,
  ): Promise<Result<BranchRow>> {
    const access = authorize(staff, "branches:manage");
    if (!access.ok) return access;
    const parsed = parseBranchUpdate(input);
    if (!parsed.success) {
      return invalid(
        "Some branch details need attention.",
        issuesFromZod(parsed.error.issues),
      );
    }
    const current = await this.deps.branches.findRowById(id);
    if (!current) return failure("NOT_FOUND", NOT_FOUND);
    const patch = parsed.data;

    // The old public URLs redirect to the default branch (next.config.ts),
    // so it must stay reachable (owner decision, spec 0002).
    if (current.slug === DEFAULT_BRANCH_SLUG && patch.status === "INACTIVE") {
      return failure("VALIDATION", DEFAULT_BRANCH_DEACTIVATION_MESSAGE, {
        status: [DEFAULT_BRANCH_DEACTIVATION_MESSAGE],
      });
    }
    const pick = <K extends keyof BranchUpdateAttributes & keyof BranchRow>(
      key: K,
    ) => (patch[key] !== undefined ? patch[key] : current[key]);
    const crossField = branchCrossFieldIssues({
      syncFollowUpMinutes: pick("syncFollowUpMinutes") as number,
      syncReminderIntervalMinutes: pick(
        "syncReminderIntervalMinutes",
      ) as number,
      latitude: pick("latitude") as number | null,
      longitude: pick("longitude") as number | null,
    });
    if (crossField.length > 0) {
      return invalid("Some branch details need attention.", crossField);
    }
    if (patch.heroMediaId !== undefined) {
      const hero = await this.checkHero(patch.heroMediaId);
      if (!hero.ok) return hero;
    }

    const changes = changedFields(current, patch);
    if (Object.keys(changes).length === 0) return success(current);
    const result = await this.deps.branches.update(
      id,
      patch,
      access.value.id,
      auditEvent({
        occurredAt: this.deps.clock.now(),
        actorType: "STAFF",
        actorId: access.value.id,
        action: "branch.updated",
        entityType: "Branch",
        entityId: id,
        branchId: id,
        reason: null,
        changes,
      }),
    );
    if (result.ok) await this.invalidateBranch(current);
    return result;
  }

  private async checkHero(id: string | null): Promise<Result<void>> {
    if (id === null || (await this.deps.media.isUsableImage(id))) {
      return success(undefined);
    }
    return failure("VALIDATION", HERO_UNUSABLE, {
      heroMediaId: [HERO_UNUSABLE],
    });
  }

  /** Every public tag of the branch, listed explicitly (spec 0002). */
  private async invalidateBranch(branch: BranchRow) {
    const { rooms, facilities } = await this.deps.branches.publishedSlugs(
      branch.id,
    );
    await this.deps.cache.invalidate([
      CACHE_TAGS.branches,
      CACHE_TAGS.sitemap,
      ...PAGE_KEYS.map((key) => CACHE_TAGS.page(branch.slug, key)),
      CACHE_TAGS.stay(branch.slug),
      CACHE_TAGS.facilities(branch.slug),
      ...rooms.map((slug) => CACHE_TAGS.stayItem(branch.slug, slug)),
      ...facilities.map((slug) => CACHE_TAGS.facility(branch.slug, slug)),
    ]);
  }
}

/** The patch fields whose value differs from the stored row. */
function changedFields(current: BranchRow, patch: BranchUpdateAttributes) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [field, to] of Object.entries(patch)) {
    const from = (current as Record<string, unknown>)[field];
    if (from !== to) changes[field] = { from, to };
  }
  return changes;
}
