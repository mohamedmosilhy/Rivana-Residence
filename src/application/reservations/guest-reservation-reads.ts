import type {
  GuestRepository,
  PhoneVerificationRepository,
} from "@/application/guests";
import type { Clock } from "@/application/shared/providers";
import { failure, success, type Result } from "@/application/shared/result";
import {
  PhoneNumber,
  canReadReservationContact,
  checkPhoneVerificationToken,
  type GuestContactGrant,
} from "@/domain/guests";
import {
  CancellationDeadline,
  ReservationReference,
  canRequestCancellation,
  type DeadlineBranch,
} from "@/domain/reservations";
import { DomainValidationError } from "@/domain/shared/domain-error";
import type { GuestChangeRequest } from "./change-request-ports";
import type {
  BookingCrypto,
  GuestCancellationRequest,
  StoredReservation,
} from "./ports";

// G1, G3 and G4 (spec 0005 Decision 4). A guest proves access
// with a bearer token; the server stores and compares only its SHA-256.
// Every bad token looks the same, so a response never says whether a token
// was unknown, expired, rotated or meant for another purpose.

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export type GuestBranchContact = Readonly<{
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
}>;
export type GuestReservationRecord = Readonly<{
  stored: StoredReservation;
  branch: GuestBranchContact;
  /** Listing names by room type id. */
  roomNames: Readonly<Record<string, string>>;
  /** The phone of the guest profile that owns the reservation, null for none. */
  ownerPhone: string | null;
  phoneBlocked: boolean;
  cancellationTiming: DeadlineBranch;
  currentCancellationRequest: GuestCancellationRequest | null;
  cancellationRequestActive: boolean;
  currentChangeRequest: GuestChangeRequest | null;
  paidTotalMinor: number | null;
}>;
export type GuestReservationSummary = Readonly<{
  reference: string;
  status: StoredReservation["status"];
  branchName: string;
  branchSlug: string;
  stay: Readonly<{ checkIn: string; checkOut: string }>;
  units: number;
  totalMinor: number | null;
  createdAt: Date;
}>;

/** Unlocked reads that start from a token, a verified phone or a verified email, never from a branch. */
export interface GuestReservationReader {
  findByManageTokenHash(
    tokenHash: string,
  ): Promise<GuestReservationRecord | null>;
  /** Through the guest's unique phone, newest first. */
  listForPhone(phone: PhoneNumber): Promise<readonly GuestReservationSummary[]>;
  findForPhone(
    phone: PhoneNumber,
    reference: ReservationReference,
  ): Promise<GuestReservationRecord | null>;
  /** Bookings whose contact email is this normalized email, newest first (ADR 031). */
  listForEmail(email: string): Promise<readonly GuestReservationSummary[]>;
  findForEmail(
    email: string,
    reference: ReservationReference,
  ): Promise<GuestReservationRecord | null>;
}

/**
 * Who a guest session token proves (ADR 031). A WhatsApp session proves the
 * phone. An email session proves only the email; its phone is the one typed
 * at P9, used for the block check and never to find bookings.
 */
export type GuestSessionIdentity =
  | Readonly<{ channel: "WHATSAPP"; phone: PhoneNumber }>
  | Readonly<{ channel: "EMAIL"; phone: PhoneNumber; email: string }>;

export function sessionGrant(
  identity: GuestSessionIdentity,
): GuestContactGrant {
  return identity.channel === "EMAIL"
    ? { kind: "EMAIL_SESSION", email: identity.email }
    : { kind: "GUEST_SESSION", phone: identity.phone };
}

export function sameSession(a: GuestSessionIdentity, b: GuestSessionIdentity) {
  return (
    a.channel === b.channel &&
    a.phone.equals(b.phone) &&
    (a.channel !== "EMAIL" || (b.channel === "EMAIL" && a.email === b.email))
  );
}

export function guestReservationView(
  record: GuestReservationRecord,
  grant: GuestContactGrant,
  now: Date,
) {
  const { stored: reservation, branch, roomNames, ownerPhone } = record;
  // Contact appears only behind one of the two tokens (R-8). A session grant
  // is compared with the owning profile's phone, a second check on top of the
  // reader's own ownership query.
  const showContact = canReadReservationContact(
    grant,
    reservation.id,
    ownerPhone === null ? null : PhoneNumber.parse(ownerPhone),
    false,
    reservation.contact.email,
  );
  const { deadline, eligibility } = guestCancellationEligibility(
    reservation,
    record.cancellationTiming,
    record.currentCancellationRequest,
    record.phoneBlocked,
    now,
    {
      changeRequestOpen: record.currentChangeRequest?.status === "OPEN",
      cancellationRequestActive: record.cancellationRequestActive,
    },
  );
  return {
    reference: reservation.reference.value,
    status: reservation.status,
    paymentMethod: reservation.paymentMethod,
    paymentStatus: reservation.paymentStatus,
    // Only the view carries the time zone. Refusals that name the hotel keep
    // the contact fields alone.
    branch: { ...branch, timeZone: record.cancellationTiming.timeZone },
    stay: reservation.stay,
    units: reservation.lines.map((line) => ({
      roomName: roomNames[line.roomTypeId] ?? null,
      occupancy: line.occupancy,
      subtotal: line.subtotal,
    })),
    contact: showContact
      ? {
          fullName: reservation.contact.fullName,
          email: reservation.contact.email,
          phone: reservation.contact.phone,
          country: reservation.contact.country,
          specialRequests: reservation.contact.specialRequests,
        }
      : null,
    price: reservation.snapshot,
    cancellationDeadline: deadline,
    currentCancellationRequest: showContact
      ? record.currentCancellationRequest
      : null,
    currentChangeRequest: showContact ? record.currentChangeRequest : null,
    allowedActions:
      showContact && eligibility.allowed
        ? ([
            "REQUEST_CANCELLATION",
            ...(reservation.snapshot &&
            (reservation.paymentMethod === "PAY_AT_HOTEL" ||
              record.paidTotalMinor !== null)
              ? (["CHANGE_RESERVATION"] as const)
              : []),
          ] as const)
        : [],
    createdAt: reservation.createdAt,
  } as const;
}
export type GuestReservationView = ReturnType<typeof guestReservationView>;

/** An older reservation may have a contact phone without a linked profile. */
export function unlinkedReservationPhone(
  reservation: StoredReservation,
): PhoneNumber | null {
  if (reservation.guestId !== null || reservation.contact.phone === null)
    return null;
  try {
    return PhoneNumber.parse(reservation.contact.phone);
  } catch (error) {
    if (error instanceof DomainValidationError) return null;
    throw error;
  }
}

export function guestCancellationEligibility(
  reservation: StoredReservation,
  branch: DeadlineBranch,
  request: GuestCancellationRequest | null,
  phoneBlocked: boolean,
  now: Date,
  requests: { changeRequestOpen: boolean; cancellationRequestActive: boolean },
) {
  const deadline = CancellationDeadline.for(branch, reservation.stay.checkIn);
  const eligibility = canRequestCancellation({
    reservationStatus: reservation.status,
    paymentStatus: reservation.paymentStatus,
    requestStatuses: request ? [request.status] : [],
    ...requests,
    phoneBlocked,
    deadline,
    now,
  });
  return { deadline, eligibility };
}

type Dependencies = Readonly<{
  reader: GuestReservationReader;
  crypto: Pick<BookingCrypto, "sha256">;
  clock: Clock;
}>;

export const invalidLink = () =>
  failure("UNAUTHENTICATED", "This link is not valid or has expired.");
export const invalidSession = () =>
  failure("PHONE_NOT_VERIFIED", "Verify your phone to continue.");

export function guestTokenHash(
  crypto: Pick<BookingCrypto, "sha256">,
  token: string | null,
) {
  return token !== null && TOKEN_FORMAT.test(token)
    ? crypto.sha256(token)
    : null;
}

export function manageTokenMatches(
  reservation: StoredReservation,
  tokenHash: string,
  now: Date,
) {
  return (
    reservation.manageTokenHash === tokenHash &&
    reservation.manageTokenExpiresAt !== null &&
    reservation.manageTokenExpiresAt > now
  );
}

/** G1. */
export class ViewGuestReservation {
  constructor(private readonly deps: Dependencies) {}

  async execute(token: string | null): Promise<Result<GuestReservationView>> {
    const tokenHash = guestTokenHash(this.deps.crypto, token);
    if (tokenHash === null) return invalidLink();
    const record = await this.deps.reader.findByManageTokenHash(tokenHash);
    const now = this.deps.clock.now();
    if (!record || !manageTokenMatches(record.stored, tokenHash, now))
      return invalidLink();
    return success(
      guestReservationView(
        record,
        {
          kind: "MANAGE_TOKEN",
          reservationId: record.stored.id,
        },
        now,
      ),
    );
  }
}

export type SessionDependencies = Dependencies &
  Readonly<{
    verifications: Pick<PhoneVerificationRepository, "findByTokenHash">;
    guests: Pick<GuestRepository, "findByPhone">;
  }>;

/**
 * Who a guest session token proves. A blocked phone is refused only after the
 * token is known, so the 403 reveals nothing to a stranger.
 */
export async function sessionIdentity(
  deps: Pick<SessionDependencies, "clock" | "guests" | "verifications">,
  tokenHash: string | null,
): Promise<Result<GuestSessionIdentity>> {
  if (tokenHash === null) return invalidSession();
  const record = await deps.verifications.findByTokenHash(tokenHash);
  if (!record) return invalidSession();
  const phone = PhoneNumber.parse(record.phone);
  const guest = await deps.guests.findByPhone(phone);
  const checked = checkPhoneVerificationToken(
    {
      purpose: record.purpose,
      phone,
      channel: record.channel,
      email: record.email,
      verifiedAt: record.verifiedAt,
      tokenExpiresAt: record.tokenExpiresAt,
      consumedAt: record.consumedAt,
    },
    "GUEST_SESSION",
    phone,
    deps.clock.now(),
    Boolean(guest?.blockedAt),
    // An email session is the email its own token proved.
    record.email,
  );
  if (checked.valid)
    return success(
      checked.channel === "EMAIL" && record.email !== null
        ? { channel: "EMAIL", phone, email: record.email }
        : { channel: "WHATSAPP", phone },
    );
  return checked.code === "PHONE_BLOCKED"
    ? guestPhoneBlocked()
    : invalidSession();
}

export const guestPhoneBlocked = () =>
  failure("PHONE_BLOCKED", "Please contact the hotel to continue.");

export const guestReservationNotFound = () =>
  failure("NOT_FOUND", "This reservation was not found.");

export async function reservationForSession(
  reader: GuestReservationReader,
  identity: GuestSessionIdentity,
  rawReference: unknown,
): Promise<Result<GuestReservationRecord>> {
  let reference: ReservationReference;
  try {
    reference = ReservationReference.parse(rawReference);
  } catch (error) {
    if (error instanceof DomainValidationError)
      return guestReservationNotFound();
    throw error;
  }
  const record =
    identity.channel === "EMAIL"
      ? await reader.findForEmail(identity.email, reference)
      : await reader.findForPhone(identity.phone, reference);
  return record ? success(record) : guestReservationNotFound();
}

/** G3. */
export class ListGuestReservations {
  constructor(private readonly deps: SessionDependencies) {}

  async execute(token: string | null) {
    const identity = await sessionIdentity(
      this.deps,
      guestTokenHash(this.deps.crypto, token),
    );
    if (!identity.ok) return identity;
    const session = identity.value;
    return success({
      items:
        session.channel === "EMAIL"
          ? await this.deps.reader.listForEmail(session.email)
          : await this.deps.reader.listForPhone(session.phone),
    });
  }
}

/** G4. A reference that is not this session's is the same `404` as one that does not exist. */
export class ViewGuestSessionReservation {
  constructor(private readonly deps: SessionDependencies) {}

  async execute(
    token: string | null,
    rawReference: unknown,
  ): Promise<Result<GuestReservationView>> {
    const tokenHash = guestTokenHash(this.deps.crypto, token);
    const identity = await sessionIdentity(this.deps, tokenHash);
    if (!identity.ok) return identity;
    const record = await reservationForSession(
      this.deps.reader,
      identity.value,
      rawReference,
    );
    // The snapshot opens after the first session check. A block can revoke
    // the token before that snapshot loads contact and request details.
    const current = await sessionIdentity(this.deps, tokenHash);
    if (!current.ok) return current;
    if (!sameSession(current.value, identity.value)) return invalidSession();
    if (!record.ok) return record;
    return success(
      guestReservationView(
        record.value,
        sessionGrant(identity.value),
        this.deps.clock.now(),
      ),
    );
  }
}
