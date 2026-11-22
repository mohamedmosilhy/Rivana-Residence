import type { StaffPrincipal } from "@/application/auth";
import type { Clock } from "@/application/shared/providers";
import {
  failure,
  invalid,
  pmsUpdateStale,
  type Result,
  staleVersion,
  success,
} from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";

import type { ReservationUnitOfWork } from "./ports";
import {
  findStaffReservation,
  staffReservationView,
  type StaffReservationReader,
  type StaffReservationView,
} from "./staff-reservation-reads";
import type { ReservationStorageContext } from "./storage-context";

export type MarkChangeEnteredInput = Readonly<{
  /** The `changeSeq` of the reservation the staff member entered into the hotel system. */
  changeSeq: number;
  note?: string | undefined;
}>;

type Dependencies = Readonly<{
  unitOfWork: ReservationUnitOfWork<ReservationStorageContext>;
  reads: Pick<StaffReservationReader, "findVisible">;
  clock: Clock;
}>;

/**
 * M8-T9 (S55, Q-84): clears "changed, update hotel system". The caller says
 * which change it entered. When another change landed since, the answer is
 * `409 PMS_UPDATE_STALE` and the flag stays set, so the flag only clears when
 * the latest change is the one acknowledged.
 */
export class MarkChangeEnteredInHotelSystem {
  constructor(private readonly deps: Dependencies) {}

  async execute(
    staff: StaffPrincipal | null,
    id: string,
    expectedVersion: number | null,
    input: MarkChangeEnteredInput,
  ): Promise<Result<{ reservation: StaffReservationView }>> {
    const found = await findStaffReservation(
      this.deps.reads,
      staff,
      id,
      "reservations:pms-entry",
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
    const now = this.deps.clock.now();
    const result = await this.deps.unitOfWork.run(async (context) => {
      const locked = await context.reservations.lockById(row.branchId, id);
      if (!locked.ok) return locked;
      const current = locked.value;
      if (!current)
        return failure("NOT_FOUND", "This reservation was not found.");
      const pendingSince = current.pmsUpdatePendingSince;
      if (pendingSince === null)
        return failure(
          "NO_PMS_UPDATE_PENDING",
          "No hotel system update is pending for this reservation.",
        );
      // The change number is checked first: it names what was entered.
      if (input.changeSeq !== current.changeSeq)
        return pmsUpdateStale(current.changeSeq);
      if (current.version !== expectedVersion)
        return staleVersion(current.version);
      const stored = await context.reservations.clearPmsUpdate(
        current.branchId,
        id,
        now,
      );
      await context.audit.append(
        auditEvent({
          occurredAt: now,
          actorType: "STAFF",
          actorId: principal.id,
          action: "reservation.pms-update-entered",
          entityType: "Reservation",
          entityId: id,
          branchId: current.branchId,
          reason: note,
          changes: {
            reference: current.reference.value,
            changeSeq: current.changeSeq,
            pendingSince: pendingSince.toISOString(),
          },
        }),
      );
      return success(stored);
    });
    if (!result.ok) return result;
    return success({
      reservation: staffReservationView(result.value, principal, now),
    });
  }
}
