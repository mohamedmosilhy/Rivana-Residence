import type { AuditEvent } from "@/domain/audit";
import type {
  BranchCreateAttributes,
  BranchStatus,
  BranchUpdateAttributes,
} from "@/domain/branches";
import type { DefaultSection } from "@/domain/content/default-sections";
import type { PageKey } from "@/domain/content/page-sections";
import type { AccommodationType } from "@/domain/shared/types";

import type { Result } from "@/application/shared/result";

/** Identity and ordering only: CMS selectors, scope checks, cache tags. */
export type BranchRecord = Readonly<{
  id: string;
  slug: string;
  name: string;
  status: BranchStatus;
  sortOrder: number;
}>;

/** Every branch attribute the public site and the branch form use. */
export type BranchRow = BranchRecord &
  Readonly<{
    summary: string | null;
    onlineBookingEnabled: boolean;
    timeZone: string;
    phone: string | null;
    email: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
    mapEmbedUrl: string | null;
    checkInTime: string | null;
    checkOutTime: string | null;
    heroMediaId: string | null;
    syncReminderIntervalMinutes: number;
    syncFollowUpMinutes: number;
    updatedAt: Date;
  }>;

/** What each branch has published, for labels, the switcher, and sitemaps. */
export type BranchCatalogFlags = Readonly<{
  branchId: string;
  stayTypes: readonly AccommodationType[];
  hasFacilities: boolean;
}>;

/** The pages a new branch starts with (spec 0002). */
export type BranchPageSeed = Readonly<{
  key: PageKey;
  title: string;
  canonicalPath: string;
  sections: readonly DefaultSection[];
}>;

/**
 * Branch persistence. Public reads use only ACTIVE branches; the CMS and
 * branch admin read every branch. Writes run in one transaction with their
 * audit event.
 */
export interface BranchRepository {
  /** Lowest sortOrder (then id) among ACTIVE branches; null when none. */
  findDefaultActive(): Promise<BranchRecord | null>;
  /** Lowest sortOrder (then id) of any status; null when none exist. */
  findDefault(): Promise<BranchRecord | null>;
  findById(id: string): Promise<BranchRecord | null>;
  findBySlug(slug: string): Promise<BranchRecord | null>;
  /** Every branch, by display order (CMS selector, branch admin). */
  listAll(): Promise<readonly BranchRecord[]>;
  /** Full rows of ACTIVE branches, by display order. */
  listActiveRows(): Promise<readonly BranchRow[]>;
  /** Full rows of every branch, by display order (branch admin). */
  listRows(): Promise<readonly BranchRow[]>;
  findRowById(id: string): Promise<BranchRow | null>;
  findActiveRowBySlug(slug: string): Promise<BranchRow | null>;
  /** Published listing types and whether any facility is published. */
  catalogFlags(
    branchIds: readonly string[],
  ): Promise<readonly BranchCatalogFlags[]>;
  /** Published listing and facility slugs (to expire their cache tags). */
  publishedSlugs(
    branchId: string,
  ): Promise<Readonly<{ rooms: string[]; facilities: string[] }>>;
  /**
   * Inserts the branch, its pages with their draft sections, and the audit
   * event in one transaction. CONFLICT when the slug is taken.
   */
  create(
    input: BranchCreateAttributes,
    pages: readonly BranchPageSeed[],
    audit: (branchId: string) => AuditEvent,
  ): Promise<Result<BranchRow>>;
  /** Writes the changed fields and the audit event in one transaction. */
  update(
    id: string,
    patch: BranchUpdateAttributes,
    actorId: string,
    audit: AuditEvent | null,
  ): Promise<Result<BranchRow>>;
}
