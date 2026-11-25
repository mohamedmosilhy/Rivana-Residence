import type {
  GuestProfile,
  GuestRepository,
  PhoneVerificationRepository,
} from "@/application/guests";
import type { Clock } from "@/application/shared/providers";
import { success, type Result } from "@/application/shared/result";
import {
  guestReservationNotFound,
  guestTokenHash,
  invalidLink,
  invalidSession,
  manageTokenMatches,
  reservationForSession,
  sessionIdentity,
  unlinkedReservationPhone,
  type GuestReservationRecord,
  type GuestSessionIdentity,
  type SessionDependencies,
} from "./guest-reservation-reads";
import type { ReservationRepository, StoredReservation } from "./ports";

export type GuestReservationAccess =
  | Readonly<{ kind: "MANAGE_TOKEN"; token: string | null }>
  | Readonly<{
      kind: "GUEST_SESSION";
      token: string | null;
      reference: unknown;
    }>;

type LocatedReservation = Readonly<{
  access: GuestReservationAccess;
  record: GuestReservationRecord;
  /** Null for the manage link. */
  session: GuestSessionIdentity | null;
  tokenHash: string;
}>;

export async function locateGuestReservation(
  deps: SessionDependencies,
  access: GuestReservationAccess,
): Promise<Result<LocatedReservation>> {
  const tokenHash = guestTokenHash(deps.crypto, access.token);
  if (tokenHash === null)
    return access.kind === "MANAGE_TOKEN" ? invalidLink() : invalidSession();
  if (access.kind === "MANAGE_TOKEN") {
    const record = await deps.reader.findByManageTokenHash(tokenHash);
    if (
      !record ||
      !manageTokenMatches(record.stored, tokenHash, deps.clock.now())
    )
      return invalidLink();
    return success({ access, record, tokenHash, session: null });
  }

  const session = await sessionIdentity(deps, tokenHash);
  if (!session.ok) return session;
  const record = await reservationForSession(
    deps.reader,
    session.value,
    access.reference,
  );
  if (!record.ok) return record;
  return success({
    access,
    record: record.value,
    tokenHash,
    session: session.value,
  });
}

type AccessLockContext = {
  guests: Pick<GuestRepository, "lockById" | "lockByPhone" | "findByPhone">;
  verifications: Pick<
    PhoneVerificationRepository,
    "findByTokenHash" | "lockPhone"
  >;
  reservations: Pick<ReservationRepository, "lockById">;
};

export async function lockBookingGuest(
  context: AccessLockContext,
  reservation: StoredReservation,
) {
  // Blocking and contact changes follow guest before reservation lock order.
  const unlinkedPhone = unlinkedReservationPhone(reservation);
  if (unlinkedPhone) {
    // A phone block must wait even if a profile for this number is
    // created after we look it up. Blocking takes this same lock first.
    const phoneLock = await context.verifications.lockPhone(unlinkedPhone);
    if (!phoneLock.ok) return phoneLock;
  }
  const guest =
    reservation.guestId !== null
      ? await context.guests.lockById(reservation.guestId)
      : unlinkedPhone
        ? await context.guests.lockByPhone(unlinkedPhone)
        : success(null);
  return guest;
}

export async function lockGuestBooking(
  context: AccessLockContext,
  located: LocatedReservation,
  guest: GuestProfile | null,
  clock: Clock,
) {
  const {
    access,
    record: { stored: reservation },
    tokenHash,
  } = located;
  const locked = await context.reservations.lockById(
    reservation.branchId,
    reservation.id,
  );
  if (!locked.ok) return locked;
  const current = locked.value;
  const now = clock.now();

  if (access.kind === "MANAGE_TOKEN") {
    if (
      !current ||
      !manageTokenMatches(current, tokenHash, now) ||
      current.guestId !== reservation.guestId ||
      (current.guestId === null &&
        current.contact.phone !== reservation.contact.phone)
    )
      return invalidLink();
  } else {
    const session = await sessionIdentity(
      {
        guests: context.guests,
        verifications: context.verifications,
        clock: { now: () => now },
      },
      tokenHash,
    );
    if (!session.ok) return session;
    const identity = session.value;
    if (identity.channel === "EMAIL") {
      // An email session acts only while the booking still carries the email
      // it proved, checked under the reservation lock (ADR 031). A staff or
      // guest email change that committed first makes it a foreign booking.
      if (
        !current ||
        current.guestId !== reservation.guestId ||
        current.contact.email !== identity.email
      )
        return guestReservationNotFound();
    } else if (
      !current ||
      !guest ||
      current.guestId !== guest.id ||
      guest.phone !== identity.phone.value ||
      // A phone session never acts on a booking verified by email (Decision 9).
      current.verificationChannel === "EMAIL"
    )
      return guestReservationNotFound();
  }

  return success({ current, now });
}
