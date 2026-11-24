import type { CouponRedemptionStore } from "@/application/coupons";
import type { QueueReservationMessages } from "@/application/notifications";
import type {
  BookingPaymentStore,
  PaymentSweepStore,
} from "@/application/payments";
import type { Clock } from "@/application/shared/providers";

import { expireHoldIfOverdue } from "./booking-payment-holds";
import type { ReservationUnitOfWork } from "./ports";
import { sweepInPages } from "./sweep-pages";
import type { ReservationStorageContext } from "./storage-context";

export type ExpirePaymentHoldsContext = ReservationStorageContext &
  Readonly<{
    payments: BookingPaymentStore;
    redemptions: Pick<CouponRedemptionStore, "release">;
    messages: Pick<QueueReservationMessages, "enqueue" | "discardHeld">;
  }>;

export type ExpirePaymentHoldsSummary = Readonly<{
  expired: number;
  skipped: number;
  failed: number;
}>;

/** Overdue holds read per page. A run reads up to `SWEEP_PAGES` pages; the next run picks up the rest. */
export const EXPIRE_HOLDS_BATCH = 100;

/**
 * Scheduled hold expiry (spec 0006 Decision 6). Each overdue `AWAITING_PAYMENT`
 * reservation is ended in its own transaction under the reservation lock only,
 * by the same step booking creation uses. One failing booking never stops the
 * rest. The summary carries counts only.
 */
export class ExpirePaymentHolds {
  constructor(
    private readonly deps: Readonly<{
      unitOfWork: ReservationUnitOfWork<ExpirePaymentHoldsContext>;
      sweep: Pick<PaymentSweepStore, "findOverdueHolds">;
      clock: Clock;
    }>,
  ) {}

  async run(): Promise<ExpirePaymentHoldsSummary> {
    const { unitOfWork, sweep, clock } = this.deps;
    let expired = 0;
    let skipped = 0;
    let failed = 0;
    await sweepInPages(
      EXPIRE_HOLDS_BATCH,
      (exclude) =>
        sweep.findOverdueHolds(clock.now(), EXPIRE_HOLDS_BATCH, exclude),
      async ({ id, branchId }) => {
        try {
          const result = await unitOfWork.run((context) =>
            expireHoldIfOverdue(context, branchId, id, clock.now()),
          );
          // A busy row (TRY_AGAIN) is retried by the next run.
          if (!result.ok) failed += 1;
          else if (result.value) expired += 1;
          else skipped += 1;
        } catch {
          failed += 1;
        }
      },
    );
    return { expired, skipped, failed };
  }
}
