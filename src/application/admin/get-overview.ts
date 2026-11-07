import { authorize } from "@/application/auth/authorize";
import type { StaffPrincipal } from "@/application/auth/ports";
import type { Clock } from "@/application/ports/providers";
import type {
  AdminOverviewDto,
  AdminOverviewReader,
} from "@/application/ports/repositories";
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
