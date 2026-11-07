import type { BranchStatus } from "@/domain/branches";

export type BranchSummary = Readonly<{
  id: string;
  slug: string;
  name: string;
  status: BranchStatus;
  sortOrder: number;
}>;

/**
 * Read access to branches. In M4 there is exactly one branch; public queries
 * use the first active one and CMS commands the first one of any status
 * (spec 0001). Branch selection arrives with branch websites in M5.
 */
export interface BranchRepository {
  /** Lowest sortOrder (then id) among ACTIVE branches; null when none. */
  findDefaultActive(): Promise<BranchSummary | null>;
  /** Lowest sortOrder (then id) of any status; null when none exist. */
  findDefault(): Promise<BranchSummary | null>;
  findById(id: string): Promise<BranchSummary | null>;
  findBySlug(slug: string): Promise<BranchSummary | null>;
}
