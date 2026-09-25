import { authorize } from "@/application/auth/authorize";
import type { StaffPrincipal } from "@/application/auth/ports";
import { CACHE_TAGS } from "@/application/cache/cache-tags";
import type { CacheInvalidator, Clock } from "@/application/ports/providers";
import type {
  PagedResult,
  PromotionDto,
  PromotionInput,
  PromotionRepository,
} from "@/application/ports/repositories";
import {
  ADMIN_PAGE_SIZE,
  parsePageNumber,
} from "@/application/shared/pagination";
import { failure, success, type Result } from "@/application/shared/result";
import type { Capability } from "@/domain/auth/capabilities";
import { selectActivePromotion } from "@/domain/promotions/promotion";
import {
  PUBLICATION_STATUSES,
  type PublicationStatus,
} from "@/domain/shared/types";
import { zonedLocalToUtc } from "@/domain/shared/zoned-time";

import {
  checkbox,
  optionalString,
  requiredNumber,
  stringValue,
  type FormValues,
} from "@/application/content/form-values";

/**
 * Shapes promotion form values. Schedule times are wall-clock times in the
 * property's zone; a malformed time is an error rather than "no limit".
 */
export function promotionInputFromForm(
  values: FormValues,
  timeZone: string,
): Result<PromotionInput> {
  const errors: Record<string, string[]> = {};
  const time = (name: "startsAt" | "endsAt", label: string) => {
    const raw = stringValue(values, name).trim();
    if (!raw) return null;
    const date = zonedLocalToUtc(raw, timeZone);
    if (!date) errors[name] = [`Enter a valid ${label} date and time.`];
    return date;
  };
  const input = {
    internalName: stringValue(values, "internalName"),
    headline: stringValue(values, "headline"),
    body: stringValue(values, "body"),
    code: stringValue(values, "code"),
    terms: optionalString(values, "terms"),
    startsAt: time("startsAt", "start"),
    endsAt: time("endsAt", "end"),
    priority: requiredNumber(values, "priority") as number,
    showAsPopup: checkbox(values, "showAsPopup"),
  };
  if (Object.keys(errors).length > 0) {
    return failure(
      "VALIDATION",
      "Some promotion details need attention.",
      errors,
    );
  }
  return success(input);
}

export const PROMOTION_TIMINGS = ["active", "scheduled", "expired"] as const;
export type PromotionTiming = (typeof PROMOTION_TIMINGS)[number];

/** Where `now` falls in a promotion's window, ignoring its status. */
export function promotionTiming(
  promotion: Pick<PromotionDto, "startsAt" | "endsAt">,
  now: Date,
): PromotionTiming {
  if (promotion.endsAt && promotion.endsAt <= now) return "expired";
  if (promotion.startsAt && promotion.startsAt > now) return "scheduled";
  return "active";
}

export type PromotionListQuery = Readonly<{
  status: PublicationStatus | null;
  timing: PromotionTiming | null;
  search: string | null;
  page: number;
  pageSize: number;
}>;

export function parsePromotionListQuery(
  params: Readonly<Record<string, unknown>>,
): PromotionListQuery {
  const search =
    typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  return {
    status: (PUBLICATION_STATUSES as readonly unknown[]).includes(params.status)
      ? (params.status as PublicationStatus)
      : null,
    timing: (PROMOTION_TIMINGS as readonly unknown[]).includes(params.timing)
      ? (params.timing as PromotionTiming)
      : null,
    search: search || null,
    page: parsePageNumber(params.page),
    pageSize: ADMIN_PAGE_SIZE,
  };
}

export type PromotionDisplayState =
  | Readonly<{ state: "showing" }>
  | Readonly<{ state: "outranked"; winner: PromotionDto }>
  | Readonly<{ state: "would-show" }>
  | Readonly<{ state: "would-be-outranked"; winner: PromotionDto }>
  | Readonly<{ state: "popup-off" }>
  | Readonly<{ state: "scheduled"; startsAt: Date }>
  | Readonly<{ state: "expired" }>
  | Readonly<{ state: "archived" }>;

/**
 * Explains, with the public selection rule, whether this promotion shows on
 * the website now, and which campaign shows instead when it does not.
 */
export function explainPromotionDisplay(
  promotion: PromotionDto,
  all: readonly PromotionDto[],
  now: Date,
): PromotionDisplayState {
  if (promotion.status === "ARCHIVED") return { state: "archived" };
  if (!promotion.showAsPopup) return { state: "popup-off" };
  const timing = promotionTiming(promotion, now);
  if (timing === "expired") return { state: "expired" };
  if (timing === "scheduled") {
    return { state: "scheduled", startsAt: promotion.startsAt! };
  }

  const published = promotion.status === "PUBLISHED";
  // A draft is judged as if it were published right now.
  const candidate = published
    ? promotion
    : { ...promotion, status: "PUBLISHED" as const, publishedAt: now };
  const others = all.filter((item) => item.id !== promotion.id);
  const winner = selectActivePromotion([...others, candidate], now);

  if (winner?.id === promotion.id) {
    return { state: published ? "showing" : "would-show" };
  }
  return {
    state: published ? "outranked" : "would-be-outranked",
    winner: winner as PromotionDto,
  };
}

export class PromotionAdmin {
  constructor(
    private readonly promotions: PromotionRepository,
    private readonly cache: CacheInvalidator,
    private readonly clock: Clock,
  ) {}

  async list(
    staff: StaffPrincipal | null,
    params: Readonly<Record<string, unknown>>,
  ): Promise<
    Result<PagedResult<PromotionDto> & { query: PromotionListQuery; now: Date }>
  > {
    const access = authorize(staff, "promotions:manage");
    if (!access.ok) return access;
    const query = parsePromotionListQuery(params);
    const now = this.clock.now();
    const needle = query.search?.toLocaleLowerCase("en") ?? null;
    const matches = (await this.promotions.listAdmin()).filter(
      (promotion) =>
        (query.status === null
          ? promotion.status !== "ARCHIVED"
          : promotion.status === query.status) &&
        (query.timing === null ||
          promotionTiming(promotion, now) === query.timing) &&
        (needle === null ||
          [promotion.internalName, promotion.headline, promotion.code].some(
            (field) => field.toLocaleLowerCase("en").includes(needle),
          )),
    );
    const start = (query.page - 1) * query.pageSize;
    return success({
      items: matches.slice(start, start + query.pageSize),
      total: matches.length,
      page: query.page,
      pageSize: query.pageSize,
      query,
      now,
    });
  }

  async get(
    staff: StaffPrincipal | null,
    id: string,
  ): Promise<
    Result<{
      promotion: PromotionDto;
      display: PromotionDisplayState;
      showingNow: PromotionDto | null;
    } | null>
  > {
    const access = authorize(staff, "promotions:manage");
    if (!access.ok) return access;
    const [promotion, all] = await Promise.all([
      this.promotions.findAdminById(id),
      this.promotions.listAdmin(),
    ]);
    if (!promotion) return success(null);
    const now = this.clock.now();
    return success({
      promotion,
      display: explainPromotionDisplay(promotion, all, now),
      showingNow: selectActivePromotion(all, now),
    });
  }

  create(staff: StaffPrincipal | null, input: PromotionInput) {
    return this.run(staff, "promotions:manage", (actor) =>
      this.promotions.create(input, actor),
    );
  }

  update(staff: StaffPrincipal | null, id: string, input: PromotionInput) {
    return this.run(staff, "promotions:manage", (actor) =>
      this.promotions.update(id, input, actor),
    );
  }

  publish(staff: StaffPrincipal | null, id: string) {
    return this.run(staff, "promotions:manage", (actor) =>
      this.promotions.publish(id, actor, this.clock.now()),
    );
  }

  unpublish(staff: StaffPrincipal | null, id: string) {
    return this.run(staff, "promotions:manage", (actor) =>
      this.promotions.unpublish(id, actor),
    );
  }

  archive(staff: StaffPrincipal | null, id: string) {
    return this.run(staff, "promotions:manage", (actor) =>
      this.promotions.archive(id, actor),
    );
  }

  restore(staff: StaffPrincipal | null, id: string) {
    return this.run(staff, "promotions:manage", (actor) =>
      this.promotions.restore(id, actor),
    );
  }

  /** Permanent deletion: administrators only, archived promotions only. */
  delete(staff: StaffPrincipal | null, id: string) {
    return this.run(staff, "content:delete", (actor) =>
      this.promotions.delete(id, actor),
    );
  }

  // Every promotion mutation can change the public winner, so each success
  // invalidates the active-promotion tag.
  private async run<T>(
    staff: StaffPrincipal | null,
    capability: Capability,
    operation: (actor: StaffPrincipal) => Promise<Result<T>>,
  ): Promise<Result<T>> {
    const access = authorize(staff, capability);
    if (!access.ok) return access;
    const result = await operation(access.value);
    if (result.ok) await this.cache.invalidate([CACHE_TAGS.activePromotion]);
    return result;
  }
}
