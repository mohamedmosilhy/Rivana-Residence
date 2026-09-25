import { authorize } from "@/application/auth/authorize";
import type { StaffPrincipal } from "@/application/auth/ports";
import type {
  MediaOption,
  MediaRepository,
  PagedResult,
} from "@/application/ports/repositories";
import {
  ADMIN_PAGE_SIZE,
  parsePageNumber,
} from "@/application/shared/pagination";
import { success, type Result } from "@/application/shared/result";
import { DomainValidationError } from "@/domain/shared/domain-error";
import {
  PUBLICATION_STATUSES,
  type PublicationStatus,
} from "@/domain/shared/types";

import type { CatalogRepository } from "./catalog-commands";

type Listable = Readonly<{
  id: string;
  name: string;
  slug: string;
  status: PublicationStatus;
  featured: boolean;
}>;

export type CatalogListQuery = Readonly<{
  status: PublicationStatus | null;
  featured: boolean | null;
  search: string | null;
  page: number;
  pageSize: number;
}>;

function isStatus(value: unknown): value is PublicationStatus {
  return (PUBLICATION_STATUSES as readonly unknown[]).includes(value);
}

export function parseCatalogListQuery(
  params: Readonly<Record<string, unknown>>,
): CatalogListQuery {
  const search =
    typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  return {
    status: isStatus(params.status) ? params.status : null,
    featured:
      params.featured === "yes"
        ? true
        : params.featured === "no"
          ? false
          : null,
    search: search || null,
    page: parsePageNumber(params.page),
    pageSize: ADMIN_PAGE_SIZE,
  };
}

export type CatalogListing<Dto> = PagedResult<Dto> &
  Readonly<{
    query: CatalogListQuery;
    /** True when the list shows the full active order, so moves make sense. */
    reorderable: boolean;
    /** Ids of non-archived records in display order. */
    activeOrder: readonly string[];
  }>;

/** Filters a small, already-ordered admin list in memory. */
export function filterCatalog<Dto extends Listable>(
  records: readonly Dto[],
  query: CatalogListQuery,
): CatalogListing<Dto> {
  const needle = query.search?.toLocaleLowerCase("en") ?? null;
  const matches = records.filter(
    (record) =>
      (query.status === null
        ? record.status !== "ARCHIVED"
        : record.status === query.status) &&
      (query.featured === null || record.featured === query.featured) &&
      (needle === null ||
        record.name.toLocaleLowerCase("en").includes(needle) ||
        record.slug.includes(needle)),
  );
  const start = (query.page - 1) * query.pageSize;
  return {
    items: matches.slice(start, start + query.pageSize),
    total: matches.length,
    page: query.page,
    pageSize: query.pageSize,
    query,
    reorderable:
      query.status === null &&
      query.featured === null &&
      query.search === null &&
      matches.length <= query.pageSize,
    activeOrder: records
      .filter((record) => record.status !== "ARCHIVED")
      .map((record) => record.id),
  };
}

/** Runs a domain publish assertion and returns its messages. */
export function readinessIssues(assertPublishable: () => void) {
  try {
    assertPublishable();
    return [];
  } catch (error) {
    if (error instanceof DomainValidationError) {
      return error.issues.map((issue) => issue.message);
    }
    throw error;
  }
}

export class CatalogQueries<Dto extends Listable, Input> {
  constructor(
    private readonly repository: CatalogRepository<Dto, Input>,
    private readonly media: MediaRepository,
  ) {}

  async list(
    staff: StaffPrincipal | null,
    params: Readonly<Record<string, unknown>>,
  ): Promise<Result<CatalogListing<Dto>>> {
    const access = authorize(staff, "content:edit");
    if (!access.ok) return access;
    return success(
      filterCatalog(
        await this.repository.listAdmin(),
        parseCatalogListQuery(params),
      ),
    );
  }

  async get(
    staff: StaffPrincipal | null,
    id: string,
  ): Promise<Result<{ record: Dto; media: readonly MediaOption[] } | null>> {
    const access = authorize(staff, "content:edit");
    if (!access.ok) return access;
    const [record, media] = await Promise.all([
      this.repository.findAdminById(id),
      this.media.listReady(),
    ]);
    return success(record ? { record, media } : null);
  }
}
