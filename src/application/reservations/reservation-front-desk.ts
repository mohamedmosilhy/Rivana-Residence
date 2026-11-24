import type { StaffPrincipal } from "@/application/auth";
import { InventoryGuard } from "@/application/inventory";
import { localDateAt } from "@/domain/shared/zoned-time";
import { ReservationStateMachine } from "@/domain/reservations";
import { manageTokenExpiry } from "./manage-token";
import {
  closeCancellationRequest,
  type CloseCancellationRequestContext,
} from "./close-cancellation-request";
import type { ReservationUnitOfWork } from "./ports";
import type { ReservationStorageContext } from "./storage-context";
import {
  failure,
  invalidTransition,
  staleVersion,
  success,
} from "@/application/shared/result";
import {
  findStaffReservation,
  staffReservationView,
} from "./staff-reservation-reads";
import {
  auditOperation,
  lockOperation,
  reservationVersionRequired,
  type OperationDependencies,
} from "./staff-reservation-operation";

export class AssignPhysicalRoom {
  constructor(private readonly deps: OperationDependencies) {}

  async execute(
    staff: StaffPrincipal | null,
    id: string,
    lineId: string,
    expectedVersion: number | null,
    physicalRoomId: string | null,
  ) {
    const found = await findStaffReservation(
      this.deps.reads,
      staff,
      id,
      "reservations:front-desk",
    );
    if (!found.ok) return found;
    if (expectedVersion === null) return reservationVersionRequired();
    const { row, principal } = found.value;
    if (row.version !== expectedVersion) return staleVersion(row.version);
    const initialLine = row.lines.find((line) => line.id === lineId);
    if (!initialLine)
      return failure("NOT_FOUND", "This reservation line was not found.");
    const result = await new InventoryGuard(this.deps.unitOfWork).execute({
      branchId: row.branchId,
      roomTypeIds: [initialLine.roomTypeId],
      load: async (context) => {
        const locked = await lockOperation(context, row, expectedVersion);
        if (!locked.ok) return locked;
        const current = locked.value;
        if (current.status !== "CONFIRMED")
          return invalidTransition(
            current.status,
            "Only confirmed reservations can be assigned.",
          );
        const line = current.lines.find((candidate) => candidate.id === lineId);
        if (!line || line.roomTypeId !== initialLine.roomTypeId)
          return failure("NOT_FOUND", "This reservation line was not found.");
        if (physicalRoomId !== null) {
          const checked = await context.reservations.checkAssignment({
            branchId: row.branchId,
            roomTypeId: line.roomTypeId,
            lineId,
            physicalRoomId,
            stay: line.stay,
          });
          if (!checked.ok) return checked;
        }
        return success({ current, line, at: this.deps.clock.now() });
      },
      validate: success,
      mutate: (context, state) =>
        state.line.physicalRoomId === physicalRoomId
          ? Promise.resolve(success(state.current))
          : context.reservations.assignRoom(
              state.current,
              lineId,
              physicalRoomId,
              state.at,
            ),
      audit: async (context, state, stored) => {
        if (stored.version === state.current.version) return;
        await auditOperation(
          context,
          stored,
          principal,
          state.at,
          "reservation.room-assigned",
          {
            lineId,
            fromPhysicalRoomId: state.line.physicalRoomId,
            toPhysicalRoomId: physicalRoomId,
            assigned: physicalRoomId !== null,
          },
        );
      },
    });
    if (!result.ok) return result;
    return success({
      reservation: staffReservationView(
        result.value,
        principal,
        this.deps.clock.now(),
      ),
    });
  }
}

const actions = {
  CHECK_IN: "reservation.checked-in",
  CHECK_OUT: "reservation.checked-out",
  MARK_NO_SHOW: "reservation.no-show",
} as const;

export type FrontDeskTransitionContext = ReservationStorageContext &
  CloseCancellationRequestContext;

export class RecordFrontDeskTransition {
  constructor(
    private readonly deps: Omit<OperationDependencies, "unitOfWork"> & {
      unitOfWork: ReservationUnitOfWork<FrontDeskTransitionContext>;
    },
    private readonly action: keyof typeof actions,
  ) {}

  async execute(
    staff: StaffPrincipal | null,
    id: string,
    expectedVersion: number | null,
    note?: string,
  ) {
    const found = await findStaffReservation(
      this.deps.reads,
      staff,
      id,
      "reservations:front-desk",
    );
    if (!found.ok) return found;
    if (expectedVersion === null) return reservationVersionRequired();
    const { row, principal } = found.value;
    return this.deps.unitOfWork.run(async (context) => {
      const locked = await lockOperation(context, row, expectedVersion);
      if (!locked.ok) return locked;
      const current = locked.value;
      const at = this.deps.clock.now();
      const next = ReservationStateMachine.transition(
        {
          ...current,
          allUnitsAssigned: current.lines.every(
            (line) => line.physicalRoomId !== null,
          ),
        },
        this.action,
        localDateAt(at, current.branchTimeZone),
      );
      if (!next.allowed)
        return invalidTransition(
          current.status,
          "This action is unavailable for the current stay.",
        );
      const checkoutShortened =
        next.stay.checkOut.compare(current.stay.checkOut) < 0;
      const tokenCutoff = manageTokenExpiry(next.stay.checkOut);
      const stored = await context.reservations.recordTransition(
        current,
        {
          ...next,
          ...(checkoutShortened &&
          current.manageTokenExpiresAt !== null &&
          current.manageTokenExpiresAt > tokenCutoff
            ? { manageTokenExpiresAt: tokenCutoff }
            : {}),
        },
        at,
      );
      if (this.action !== "CHECK_OUT")
        await closeCancellationRequest(
          context,
          stored,
          this.action,
          principal.id,
          at,
        );
      await auditOperation(
        context,
        stored,
        principal,
        at,
        actions[this.action],
        {
          fromStatus: current.status,
          toStatus: next.status,
          fromCheckOut: current.stay.checkOut.value,
          toCheckOut: next.stay.checkOut.value,
          noteProvided: Boolean(note?.trim()),
        },
        note?.trim() || null,
      );
      return success({
        reservation: staffReservationView(stored, principal, at),
      });
    });
  }
}
