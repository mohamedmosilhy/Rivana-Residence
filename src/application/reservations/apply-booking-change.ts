import type { Clock, IdGenerator } from "@/application/shared/providers";
import { auditEvent } from "@/domain/audit";
import { PhoneNumber, guestWhatsAppAllowed } from "@/domain/guests";
import { summarizeReservation } from "@/domain/reservations";
import { DomainValidationError } from "@/domain/shared/domain-error";
import type { StayRange } from "@/domain/shared/stay-range";
import { manageTokenExpiry } from "./manage-token";
import type { ModifyReservationContext } from "./modify-reservation";
import type {
  BookingCrypto,
  ReservationContactPatch,
  StoredReservation,
} from "./ports";
import {
  materializeChangedLines,
  type AvailableReservationChange,
} from "./reservation-change-quote";

export type ChangeContactPatch = Pick<
  ReservationContactPatch,
  "fullName" | "email" | "specialRequests"
>;

function replacementLink(
  current: StoredReservation,
  contact: ChangeContactPatch,
  stay: StayRange,
  now: Date,
  crypto: BookingCrypto,
) {
  const previousEmail =
    contact.email !== undefined ? current.contact.email : null;
  if (previousEmail !== null) {
    // The replacement goes only to a usable phone the guest proved. A booking
    // verified by email has no proven phone, so the hotel handles recovery
    // (spec 0006 Decision 9).
    const revokeOnly = {
      previousEmail,
      token: null,
      manageAccess: { hash: null, expiresAt: null },
    };
    if (
      !guestWhatsAppAllowed(current.contact.phone, current.verificationChannel)
    )
      return revokeOnly;
    try {
      PhoneNumber.parse(current.contact.phone);
    } catch (error) {
      if (!(error instanceof DomainValidationError)) throw error;
      return revokeOnly;
    }
    const token = crypto.generateToken();
    return {
      previousEmail,
      token,
      manageAccess: {
        hash: crypto.sha256(token),
        expiresAt: manageTokenExpiry(stay.checkOut),
      },
    };
  }

  // Update expiry on an existing, still valid link after a checkout date change.
  if (
    current.stay.checkOut.compare(stay.checkOut) !== 0 &&
    current.manageTokenHash !== null &&
    current.manageTokenExpiresAt !== null &&
    current.manageTokenExpiresAt > now
  )
    return {
      previousEmail,
      token: null,
      manageAccess: {
        hash: current.manageTokenHash,
        expiresAt: manageTokenExpiry(stay.checkOut),
      },
    };
  return { previousEmail, token: null, manageAccess: undefined };
}

/** Both guest entry points and staff approvals apply the same validated quote under the listing and reservation locks. */
export async function applyBookingChange(
  context: Pick<
    ModifyReservationContext,
    "reservations" | "messages" | "audit"
  >,
  deps: Readonly<{ ids: IdGenerator; crypto: BookingCrypto }>,
  input: Readonly<{
    current: StoredReservation;
    stay: StayRange;
    quote: AvailableReservationChange;
    contact: ChangeContactPatch;
    branch: Readonly<{ phone: string | null; email: string | null }>;
    now: ReturnType<Clock["now"]>;
    actor: Readonly<{
      type: "GUEST" | "STAFF";
      id: string;
      changeRequestId?: string;
    }>;
  }>,
) {
  const { current, stay, quote, contact, branch, now, actor } = input;
  const { snapshot, plan } = quote;
  const contactFields = Object.keys(contact);
  const lines = plan.structureChanged
    ? await materializeChangedLines(context, current, stay, quote, deps.ids)
    : null;
  const link = replacementLink(current, contact, stay, now, deps.crypto);
  const reservation = await context.reservations.replaceStay({
    branchId: current.branchId,
    reservationId: current.id,
    stay,
    lines,
    snapshot,
    guestContact: contact,
    ...(link.manageAccess ? { manageAccess: link.manageAccess } : {}),
    flagPmsUpdate: current.pmsEnteredAt !== null,
    at: now,
  });
  const before = summarizeReservation(current);
  const after = {
    ...summarizeReservation(
      reservation,
      plan.services.flatMap((service) =>
        !service.added && service.detailsChanged ? [service.kind] : [],
      ),
    ),
    contactFieldsChanged: contactFields,
  };
  await context.reservations.appendChange({
    id: deps.ids.next(),
    branchId: current.branchId,
    reservationId: current.id,
    kind: "STAY",
    actorType: actor.type,
    actorId: actor.id,
    ...(actor.changeRequestId
      ? { changeRequestId: actor.changeRequestId }
      : {}),
    before,
    after,
    oldTotalMinor: before.totalMinor,
    newTotalMinor: after.totalMinor,
    override: null,
    at: now,
  });
  await context.messages.enqueue(current.branchId, current.id, {
    kind: "reservation.modified",
    notifyGuest: true,
    previous: {
      checkIn: before.checkIn,
      checkOut: before.checkOut,
      totalMinor: before.totalMinor ?? 0,
    },
  });
  await context.messages.enqueue(current.branchId, current.id, {
    kind: "reservation.change-staff-alert",
    previous: {
      checkIn: before.checkIn,
      checkOut: before.checkOut,
      totalMinor: before.totalMinor ?? 0,
    },
  });
  if (link.previousEmail !== null) {
    await context.messages.enqueue(current.branchId, current.id, {
      kind: "reservation.email-changed",
      previousEmail: link.previousEmail,
      hotelPhone: branch.phone,
      hotelEmail: branch.email,
    });
  }
  if (link.token !== null) {
    await context.messages.enqueue(current.branchId, current.id, {
      kind: "reservation.manage-link",
      manageToken: link.token,
      whatsappOnly: true,
    });
  }
  await context.audit.append(
    auditEvent({
      occurredAt: now,
      actorType: actor.type,
      actorId: actor.id,
      action: "reservation.stay-modified",
      entityType: "Reservation",
      entityId: current.id,
      branchId: current.branchId,
      reason: null,
      changes: {
        reference: current.reference.value,
        changeSeq: current.changeSeq + 1,
        before: before,
        after: after,
        oldTotalMinor: before.totalMinor,
        newTotalMinor: after.totalMinor,
        priceOverridden: false,
        overrideFromMinor: null,
        overrideToMinor: null,
        flagPmsUpdate: current.pmsEnteredAt !== null,
        guestNotified: true,
        ...(actor.changeRequestId
          ? { changeRequestId: actor.changeRequestId }
          : {}),
      },
    }),
  );
  return reservation;
}
