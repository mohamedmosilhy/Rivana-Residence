import type { StaffPrincipal } from "@/application/auth/ports";
import type { QueueReservationMessages } from "@/application/notifications";
import {
  failure,
  invalidTransition,
  success,
} from "@/application/shared/result";
import { canEditReservationGuest } from "@/domain/reservations";
import { manageTokenExpiry } from "./manage-token";
import type { BookingCrypto, ReservationUnitOfWork } from "./ports";
import {
  auditOperation,
  canMarkPmsEntered,
  lockOperation,
  reservationVersionRequired,
  type OperationDependencies,
} from "./staff-reservation-operation";
import {
  findStaffReservation,
  staffReservationView,
} from "./staff-reservation-reads";
import type { ReservationStorageContext } from "./storage-context";

export type ResendManageLinkContext = ReservationStorageContext & {
  messages: Pick<QueueReservationMessages, "enqueue">;
};

export class ResendManageLink {
  constructor(
    private readonly deps: Omit<OperationDependencies, "unitOfWork"> & {
      unitOfWork: ReservationUnitOfWork<ResendManageLinkContext>;
      crypto: BookingCrypto;
    },
  ) {}

  async execute(staff: StaffPrincipal | null, id: string) {
    const found = await findStaffReservation(
      this.deps.reads,
      staff,
      id,
      "reservations:modify",
    );
    if (!found.ok) return found;
    const { row, principal } = found.value;
    return this.deps.unitOfWork.run(async (context) => {
      const locked = await lockOperation(context, row);
      if (!locked.ok) return locked;
      const current = locked.value;
      const at = this.deps.clock.now();
      const expiresAt = manageTokenExpiry(current.stay.checkOut);
      if (!canEditReservationGuest(current.status) || expiresAt <= at)
        return invalidTransition(
          current.status,
          "A manage link cannot be sent for this stay.",
        );
      if (!current.contact.email && !current.contact.phone)
        return failure(
          "CONFLICT",
          "Add a guest contact before sending a manage link.",
        );
      const token = this.deps.crypto.generateToken();
      await context.reservations.rotateManageToken(
        current,
        this.deps.crypto.sha256(token),
        expiresAt,
        at,
      );
      await context.messages.enqueue(current.branchId, current.id, {
        kind: "reservation.manage-link",
        manageToken: token,
      });
      await auditOperation(
        context,
        current,
        principal,
        at,
        "reservation.manage-link-resent",
        {
          emailQueued: Boolean(current.contact.email),
          whatsappQueued: Boolean(current.contact.phone),
        },
      );
      return success({ branchId: current.branchId });
    });
  }
}

export class MarkEnteredInHotelSystem {
  constructor(private readonly deps: OperationDependencies) {}

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
      "reservations:pms-entry",
    );
    if (!found.ok) return found;
    if (expectedVersion === null) return reservationVersionRequired();
    const { row, principal } = found.value;
    return this.deps.unitOfWork.run(async (context) => {
      const locked = await lockOperation(context, row, expectedVersion);
      if (!locked.ok) return locked;
      const current = locked.value;
      if (current.source === "WEBSITE" && current.pmsEnteredAt !== null)
        return failure(
          "CONFLICT",
          "This reservation was already marked as entered.",
        );
      if (!canMarkPmsEntered(current))
        return invalidTransition(
          current.status,
          "This reservation cannot be marked as entered.",
        );
      const at = this.deps.clock.now();
      const stored = await context.reservations.markPmsEntered(
        current,
        principal.id,
        at,
      );
      await auditOperation(
        context,
        stored,
        principal,
        at,
        "reservation.pms-entered",
        {
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
