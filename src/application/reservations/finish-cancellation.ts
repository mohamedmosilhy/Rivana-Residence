import type { CouponRedemptionStore } from "@/application/coupons";
import type { IdGenerator } from "@/application/shared/providers";
import { summarizeReservation } from "@/domain/reservations";

import type { ReservationRepository, StoredReservation } from "./ports";

export type FinishCancellationContext = Readonly<{
  reservations: Pick<ReservationRepository, "markCancelled" | "appendChange">;
  redemptions: Pick<CouponRedemptionStore, "release">;
}>;

/**
 * The writes every staff driven cancellation shares, with the reservation row
 * locked and the state machine already satisfied: set `CANCELLED` (freeing
 * inventory), number a `CANCEL` change when the booking is already in the hotel
 * system (Q-84), and release the coupon redemption.
 */
export async function finishCancellation(
  context: FinishCancellationContext,
  current: StoredReservation,
  actor: Readonly<{ id: string }>,
  ids: IdGenerator,
  now: Date,
): Promise<{ stored: StoredReservation; flagPmsUpdate: boolean }> {
  const flagPmsUpdate = current.pmsEnteredAt !== null;
  const stored = await context.reservations.markCancelled(
    current.branchId,
    current.id,
    now,
    flagPmsUpdate,
  );
  if (flagPmsUpdate)
    await context.reservations.appendChange({
      id: ids.next(),
      branchId: current.branchId,
      reservationId: current.id,
      kind: "CANCEL",
      actorType: "STAFF",
      actorId: actor.id,
      before: summarizeReservation(current),
      after: summarizeReservation(stored),
      oldTotalMinor: current.snapshot?.totalMinor ?? null,
      newTotalMinor: current.snapshot?.totalMinor ?? null,
      override: null,
      at: now,
    });
  await context.redemptions.release(current.id, now);
  return { stored, flagPmsUpdate };
}
