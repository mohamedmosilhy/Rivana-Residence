import { authorize } from "@/application/auth/authorize";
import type { StaffPrincipal } from "@/application/auth/ports";
import {
  branchScope,
  inBranchScope,
} from "@/application/auth/authorize-branch";
import type { BranchRecord, BranchRepository } from "@/application/branches";
import type {
  ContactEnquiryDto,
  EnquiryListQuery,
  EnquiryRepository,
} from "@/application/enquiries/ports";
import {
  ADMIN_PAGE_SIZE,
  parsePageNumber,
  type PagedResult,
} from "@/application/shared/pagination";
import { success, type Result } from "@/application/shared/result";
import { ENQUIRY_STATUSES, type EnquiryStatus } from "@/domain/shared/types";

function isEnquiryStatus(value: unknown): value is EnquiryStatus {
  return (ENQUIRY_STATUSES as readonly unknown[]).includes(value);
}

/** Normalizes untrusted URL search params into a safe list query. */
export function parseEnquiryListQuery(
  params: Readonly<Record<string, unknown>>,
): Omit<EnquiryListQuery, "branchScope" | "branchId"> {
  const status = isEnquiryStatus(params.status) ? params.status : null;
  const search =
    typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  return {
    status,
    search: search || null,
    page: parsePageNumber(params.page),
    pageSize: ADMIN_PAGE_SIZE,
  };
}

export type EnquiryListing = PagedResult<ContactEnquiryDto> &
  Readonly<{
    query: Omit<EnquiryListQuery, "branchScope" | "branchId"> &
      Readonly<{ branch: string | null }>;
    /** Branches the caller may filter by. */
    branches: readonly BranchRecord[];
  }>;

export class ListEnquiries {
  constructor(
    private readonly enquiries: EnquiryRepository,
    private readonly branches: BranchRepository,
  ) {}

  async execute(
    staff: StaffPrincipal | null,
    params: Readonly<Record<string, unknown>>,
  ): Promise<Result<EnquiryListing>> {
    const access = authorize(staff, "enquiries:read");
    if (!access.ok) return access;
    // Receptionists and Managers see only their branches' enquiries (Q-26).
    // The branch filter (spec 0002) narrows inside that scope, never beyond.
    const scope = branchScope(access.value);
    const query = parseEnquiryListQuery(params);
    const branches = (await this.branches.listAll()).filter((branch) =>
      inBranchScope(scope, branch.id),
    );
    const selected =
      typeof params.branch === "string"
        ? (branches.find((branch) => branch.slug === params.branch) ?? null)
        : null;
    const page = await this.enquiries.listAdminPage({
      ...query,
      branchScope: scope,
      branchId: selected?.id ?? null,
    });
    return success({
      ...page,
      query: { ...query, branch: selected?.slug ?? null },
      branches,
    });
  }
}
