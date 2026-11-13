import type { EnquiryStatus } from "@/domain/shared/types";
import type { Result } from "@/application/shared/result";
import type { PageRequest, PagedResult } from "@/application/shared/pagination";
import type { Actor } from "@/application/shared/actor";

export type ContactEnquiryDto = Readonly<{
  id: string;
  /** The branch whose Contact page sent it; null for enquiries before M5. */
  branchId: string | null;
  /** That branch's name, for the staff list; null when none. */
  branchName?: string | null;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: EnquiryStatus;
  createdAt: Date;
}>;

export type EnquiryListQuery = PageRequest &
  Readonly<{
    status: EnquiryStatus | null;
    /** Matches sender name, email, or subject, case-insensitively. */
    search: string | null;
    /**
     * "ALL", or the only branches whose enquiries may be listed. Enquiries
     * with no branch are never in a list of ids (Q-26).
     */
    branchScope: "ALL" | readonly string[];
    /** Narrows to one branch (the list filter), inside the scope. */
    branchId: string | null;
  }>;

export interface EnquiryRepository {
  listAdmin(status?: EnquiryStatus): Promise<readonly ContactEnquiryDto[]>;
  listAdminPage(
    query: EnquiryListQuery,
  ): Promise<PagedResult<ContactEnquiryDto>>;
  create(
    input: Omit<
      ContactEnquiryDto,
      "id" | "status" | "createdAt" | "branchName"
    >,
  ): Promise<Result<ContactEnquiryDto>>;
  archive(id: string, actor: Actor, now: Date): Promise<Result<void>>;
  /** Records successful delivery; the enquiry stays NEW for staff. */
  markDelivered(id: string, messageId: string): Promise<void>;
  markDeliveryFailed(id: string): Promise<void>;
}

export interface ContactDelivery {
  deliver(input: {
    enquiryId: string;
    replyTo: string;
    subject: string;
    text: string;
  }): Promise<{ messageId: string }>;
}
