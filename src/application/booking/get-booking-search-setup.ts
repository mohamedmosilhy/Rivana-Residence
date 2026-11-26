import type { BranchRepository } from "@/application/branches";
import {
  verificationUsableForBranchNow,
  type VerificationChannelReadiness,
} from "@/application/guests";
import type { Clock } from "@/application/shared/providers";
import { localDateAt } from "@/domain/shared/zoned-time";

/** Read the branch settings needed to offer a search for a new booking. */
export class GetBookingSearchSetup {
  constructor(
    private readonly deps: Readonly<{
      branches: Pick<BranchRepository, "findRowById">;
      channels: VerificationChannelReadiness;
      paymentReady: () => boolean;
      clock: Clock;
    }>,
  ) {}

  async execute(branchId: string) {
    const branch = await this.deps.branches.findRowById(branchId);
    if (branch?.status !== "ACTIVE") return null;

    const bookable =
      branch.onlineBookingEnabled &&
      Boolean(branch.checkInTime) &&
      (await verificationUsableForBranchNow(
        this.deps.channels,
        branch.onlinePaymentEnabled && this.deps.paymentReady(),
      ));

    return {
      bookable,
      today: localDateAt(this.deps.clock.now(), branch.timeZone),
      phone: branch.phone,
      email: branch.email,
    };
  }
}
