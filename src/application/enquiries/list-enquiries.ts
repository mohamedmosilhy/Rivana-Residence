import { authorize } from "@/application/auth/authorize";
import type { StaffPrincipal } from "@/application/auth/ports";
import type {
  ContactEnquiryDto,
  EnquiryListQuery,
  EnquiryRepository,
  PagedResult,
} from "@/application/ports/repositories";
import {
  ADMIN_PAGE_SIZE,
  parsePageNumber,
} from "@/application/shared/pagination";
import { success, type Result } from "@/application/shared/result";
import { ENQUIRY_STATUSES, type EnquiryStatus } from "@/domain/shared/types";

function isEnquiryStatus(value: unknown): value is EnquiryStatus {
  return (ENQUIRY_STATUSES as readonly unknown[]).includes(value);
}

/** Normalizes untrusted URL search params into a safe list query. */
export function parseEnquiryListQuery(
  params: Readonly<Record<string, unknown>>,
): EnquiryListQuery {
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
  Readonly<{ query: EnquiryListQuery }>;

export class ListEnquiries {
  constructor(private readonly enquiries: EnquiryRepository) {}

  async execute(
    staff: StaffPrincipal | null,
    params: Readonly<Record<string, unknown>>,
  ): Promise<Result<EnquiryListing>> {
    const access = authorize(staff, "enquiries:read");
    if (!access.ok) return access;
    const query = parseEnquiryListQuery(params);
    return success({ ...(await this.enquiries.listAdminPage(query)), query });
  }
}
