import type { StaffPrincipal } from "@/application/auth";
import type { CouponRedemptionStore } from "@/application/coupons";
import type { QueueReservationMessages } from "@/application/notifications";
import type { Clock, IdGenerator } from "@/application/shared/providers";
import {
  failure,
  invalid,
  invalidTransition,
  type Result,
  staleVersion,
  success,
} from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import {
  ReservationStateMachine,
  summarizeReservation,
} from "@/domain/reservations";
import { localDateAt } from "@/domain/shared/zoned-time";

import {
  closeCancellationRequest,
  type CloseCancellationRequestContext,
} from "./close-cancellation-request";
import type { ReservationUnitOfWork } from "./ports";
import {
  findStaffReservation,
  staffReservationView,
  type StaffReservationReader,
  type StaffReservationView,
} from "./staff-reservation-reads";
import type { ReservationStorageContext } from "./storage-context";

export type CancelReservationContext = ReservationStorageContext &
  CloseCancellationRequestContext &
  Readonly<{
    redemptions: Pick<CouponRedemptionStore, "release">;
    messages: Pick<QueueReservationMessages, "enqueue">;
  }>;

export const CANCELLATION_REASONS = [
  "GUEST_REQUEST",
  "CROSS_SYSTEM_CONFLICT",
  "INVALID_DETAILS",
  "OTHER",
] as const;
export type CancellationReason = (typeof CANCELLATION_REASONS)[number];
export type CancelReservationInput = Readonly<{
  reason: CancellationReason;
  note?: string | undefined;
  notifyGuest: boolean;
}>;

// Guest facing text per reason. The staff note is internal and never sent.
const REASON_TEXT: Readonly<Record<CancellationReason, string>> = {
  GUEST_REQUEST: "Cancelled at your request",
  CROSS_SYSTEM_CONFLICT: "The room is no longer available",
  INVALID_DETAILS: "The booking details could not be confirmed",
  OTHER: "Cancelled by the hotel",
};

type Dependencies = Readonly<{
  unitOfWork: ReservationUnitOfWork<CancelReservationContext>;
  reads: Pick<StaffReservationReader, "findVisible">;
  ids: IdGenerator;
  clock: Clock;
}>;

/**
 * M8-T9 (S9): staff cancellation of an unpaid reservation. A release takes
 * only the reservation row (Decision 1): the state is re-read under that lock,
 * and the status, the freed inventory, the released coupon redemption, the
 * audit event and the outbox rows commit together or not at all. Cancelling
 * a cancelled reservation changes nothing and writes nothing.
 */
export class CancelReservation {
  constructor(private readonly deps: Dependencies) {}

  async execute(
    staff: StaffPrincipal | null,
    id: string,
    expectedVersion: number | null,
    input: CancelReservationInput,
  ): Promise<Result<{ reservation: StaffReservationView; replayed: boolean }>> {
    const found = await findStaffReservation(
      this.deps.reads,
      staff,
      id,
      "reservations:cancel",
    );
    if (!found.ok) return found;
    const { row, principal } = found.value;
    if (expectedVersion === null)
      return failure("PRECONDITION_REQUIRED", "Send an If-Match header.");
    const note = input.note?.trim() || null;
    if (note && (note.length > 500 || /[\p{Cc}\p{Cf}]/u.test(note)))
      return invalid("Check the note.", [
        { path: "note", message: "Use plain text of at most 500 characters." },
      ]);
    const result = await this.deps.unitOfWork.run(async (context) => {
      const locked = await context.reservations.lockById(row.branchId, id);
      if (!locked.ok) return locked;
      const current = locked.value;
      if (!current)
        return failure("NOT_FOUND", "This reservation was not found.");
      const now = this.deps.clock.now();
      if (current.status === "CANCELLED")
        return success({ stored: current, replayed: true, at: now });
      if (current.version !== expectedVersion)
        return staleVersion(current.version);
      const transition = ReservationStateMachine.transition(
        {
          ...current,
          allUnitsAssigned: current.lines.every(
            (line) => line.physicalRoomId !== null,
          ),
        },
        "CANCEL_UNPAID",
        localDateAt(now, current.branchTimeZone),
      );
      if (!transition.allowed)
        return invalidTransition(
          current.status,
          current.paymentStatus === "NOT_REQUIRED"
            ? "This reservation cannot be cancelled."
            : "A paid reservation is cancelled through a refund request.",
        );
      // A booking already in the hotel system is now out of date there: the
      // cancellation is a change like any other (Q-84), numbered and flagged.
      const flagPmsUpdate = current.pmsEnteredAt !== null;
      const stored = await context.reservations.markCancelled(
        current.branchId,
        id,
        now,
        flagPmsUpdate,
      );
      await closeCancellationRequest(
        context,
        stored,
        "CANCEL",
        principal.id,
        now,
      );
      if (flagPmsUpdate)
        await context.reservations.appendChange({
          id: this.deps.ids.next(),
          branchId: current.branchId,
          reservationId: id,
          kind: "CANCEL",
          actorType: "STAFF",
          actorId: principal.id,
          before: summarizeReservation(current),
          after: summarizeReservation(stored),
          oldTotalMinor: current.snapshot?.totalMinor ?? null,
          newTotalMinor: current.snapshot?.totalMinor ?? null,
          override: null,
          at: now,
        });
      await context.redemptions.release(id, now);
      await context.audit.append(
        auditEvent({
          occurredAt: now,
          actorType: "STAFF",
          actorId: principal.id,
          action: "reservation.cancelled",
          entityType: "Reservation",
          entityId: id,
          branchId: current.branchId,
          reason: note,
          changes: {
            reference: current.reference.value,
            reason: input.reason,
            noteProvided: note !== null,
            couponReleased: current.couponId !== null,
            guestNotified: input.notifyGuest,
            flagPmsUpdate,
            changeSeq: flagPmsUpdate ? stored.changeSeq : null,
          },
        }),
      );
      await context.messages.enqueue(current.branchId, id, {
        kind: "reservation.cancelled",
        notifyGuest: input.notifyGuest,
        reason: REASON_TEXT[input.reason],
      });
      return success({ stored, replayed: false, at: now });
    });
    if (!result.ok) return result;
    return success({
      reservation: staffReservationView(
        result.value.stored,
        principal,
        result.value.at,
      ),
      replayed: result.value.replayed,
    });
  }
}
