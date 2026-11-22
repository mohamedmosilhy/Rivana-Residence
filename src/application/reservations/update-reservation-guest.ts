import type { StaffPrincipal } from "@/application/auth/ports";
import type { IdGenerator } from "@/application/shared/providers";
import {
  invalid,
  invalidTransition,
  staleVersion,
  success,
} from "@/application/shared/result";
import { parseGuestContact } from "@/domain/guests";
import { canEditReservationGuest } from "@/domain/reservations";
import { DomainValidationError } from "@/domain/shared/domain-error";
import type { ReservationContactPatch, StoredReservation } from "./ports";
import {
  auditOperation,
  lockOperation,
  reservationVersionRequired,
  type OperationDependencies,
} from "./staff-reservation-operation";
import {
  findStaffReservation,
  staffReservationView,
} from "./staff-reservation-reads";

export type UpdateReservationGuestInput = Readonly<{
  guest?:
    | Readonly<{
        fullName?: string | undefined;
        phone?: string | undefined;
        email?: string | null | undefined;
        country?: string | null | undefined;
        specialRequests?: string | null | undefined;
      }>
    | undefined;
  internalNotes?: string | null | undefined;
  specialRequests?: string | null | undefined;
}>;

export class UpdateReservationGuest {
  constructor(
    private readonly deps: OperationDependencies & { ids: IdGenerator },
  ) {}

  async execute(
    staff: StaffPrincipal | null,
    id: string,
    expectedVersion: number | null,
    input: UpdateReservationGuestInput,
  ) {
    const found = await findStaffReservation(
      this.deps.reads,
      staff,
      id,
      "reservations:modify",
    );
    if (!found.ok) return found;
    if (expectedVersion === null) return reservationVersionRequired();
    const { row, principal } = found.value;
    if (row.version !== expectedVersion) return staleVersion(row.version);
    if (!canEditReservationGuest(row.status))
      return invalidTransition(
        row.status,
        "Guest details cannot be edited in this state.",
      );

    const parsed = parsePatch(row, input);
    if (!parsed.ok) return parsed;
    const { patch, phone } = parsed.value;
    const changed = Object.keys(patch);
    return this.deps.unitOfWork.run(async (context) => {
      let newGuestId: string | null = null;
      const at = this.deps.clock.now();
      if (phone) {
        // A destination profile must be locked before the reservation (spec 0005).
        const profile = await context.guests.ensureExists({
          id: this.deps.ids.next(),
          phone,
          name: patch.fullName ?? row.contact.fullName,
          email: patch.email === undefined ? row.contact.email : patch.email,
          at,
        });
        const lockedGuest = await context.guests.lockByPhone(phone);
        if (!lockedGuest.ok) return lockedGuest;
        newGuestId = profile.id;
      }
      const locked = await lockOperation(context, row, expectedVersion);
      if (!locked.ok) return locked;
      const current = locked.value;
      if (!canEditReservationGuest(current.status))
        return invalidTransition(
          current.status,
          "Guest details cannot be edited in this state.",
        );
      if (changed.length === 0)
        return success({
          reservation: staffReservationView(current, principal, at),
        });
      const stored = await context.reservations.updateContact(
        current,
        {
          patch,
          newGuestId,
          // A shared bearer link may already have reached the old address.
          revokeManageToken:
            newGuestId !== null ||
            (patch.email !== undefined && current.contact.email !== null),
        },
        at,
      );
      await auditOperation(
        context,
        stored,
        principal,
        at,
        "reservation.contact-edited",
        Object.fromEntries(changed.map((field) => [field, true])),
      );
      return success({
        reservation: staffReservationView(stored, principal, at),
      });
    });
  }
}

function parsePatch(
  row: StoredReservation,
  input: UpdateReservationGuestInput,
) {
  const { guest: guestPatch = {} } = input;
  if (
    guestPatch.specialRequests !== undefined &&
    input.specialRequests !== undefined
  )
    return invalid("Check the guest details.", [
      {
        path: "specialRequests",
        message: "Supply special requests in one place.",
      },
    ]);
  const specialRequests =
    input.specialRequests === undefined
      ? guestPatch.specialRequests
      : input.specialRequests;
  let contact: ReturnType<typeof parseGuestContact>;
  try {
    contact = parseGuestContact({
      ...guestPatch,
      fullName: guestPatch.fullName ?? row.contact.fullName,
      specialRequests,
    });
  } catch (error) {
    if (!(error instanceof DomainValidationError)) throw error;
    return invalid(
      error.message,
      error.issues.map((issue) => ({
        ...issue,
        path:
          issue.path === "specialRequests" &&
          input.specialRequests !== undefined
            ? issue.path
            : `guest.${issue.path}`,
      })),
    );
  }
  const changedPhone =
    contact.phone !== null && contact.phone.value !== row.contact.phone;
  if (changedPhone && row.source === "WEBSITE")
    return invalid("Check the guest details.", [
      {
        path: "guest.phone",
        message: "A website reservation keeps its verified phone.",
      },
    ]);
  if (guestPatch.email === null && row.source !== "STAFF")
    return invalid("Check the guest details.", [
      {
        path: "guest.email",
        message: "This reservation requires an email address.",
      },
    ]);
  const notes = input.internalNotes?.trim() || null;
  const patch: ReservationContactPatch = {
    ...(guestPatch.fullName !== undefined &&
    contact.fullName !== row.contact.fullName
      ? { fullName: contact.fullName }
      : {}),
    ...(guestPatch.email !== undefined && contact.email !== row.contact.email
      ? { email: contact.email }
      : {}),
    ...(changedPhone ? { phone: contact.phone!.value } : {}),
    ...(guestPatch.country !== undefined &&
    contact.country !== row.contact.country
      ? { country: contact.country }
      : {}),
    ...(specialRequests !== undefined &&
    contact.specialRequests !== row.contact.specialRequests
      ? { specialRequests: contact.specialRequests }
      : {}),
    ...(input.internalNotes !== undefined && notes !== row.internalNotes
      ? { internalNotes: notes }
      : {}),
  };
  return success({ patch, phone: changedPhone ? contact.phone : null });
}
