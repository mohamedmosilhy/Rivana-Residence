import { type StaffPrincipal, authorize } from "@/application/auth";
import type { AdminOverviewDto, AdminOverviewReader } from "./ports";
import type { Clock } from "@/application/shared/providers";
import { success, type Result } from "@/application/shared/result";

const RECENT_LIMIT = 6;

export class GetAdminOverview {
  constructor(
    private readonly reader: AdminOverviewReader,
    private readonly clock: Clock,
  ) {}

  async execute(
    staff: StaffPrincipal | null,
  ): Promise<Result<AdminOverviewDto>> {
    // CMS counts, draft names, and every branch's enquiry totals: only roles
    // that edit content may read them. Receptionists and Managers hold
    // `admin:access` but get a staff home instead (review of M4, Q-26).
    const access = authorize(staff, "content:edit");
    if (!access.ok) return access;
    return success(await this.reader.read(this.clock.now(), RECENT_LIMIT));
  }
}
