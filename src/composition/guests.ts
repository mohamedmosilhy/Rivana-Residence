import "server-only";
import {
  RequestPhoneVerification,
  ConfirmPhoneVerification,
  ListGuests,
  GetGuest,
  ChangeGuestBlock,
  type ChangeGuestBlockContext,
  type VerificationContext,
} from "@/application/guests";
import {
  ViewGuestReservation,
  ListGuestReservations,
  ViewGuestSessionReservation,
  RequestCancellation,
  type RequestCancellationContext,
} from "@/application/reservations";
import type { Clock } from "@/application/shared/providers";
import { NodeBookingCrypto } from "@/infrastructure/crypto/booking-crypto";
import {
  PrismaAuditLog,
  PrismaGuestHistoryReader,
} from "@/infrastructure/db/prisma/repositories/audit/audit-log";
import { PrismaGuestDirectoryReader } from "@/infrastructure/db/prisma/repositories/reservations/guests/guest-directory-reader";
import { PrismaGuestReservationReader } from "@/infrastructure/db/prisma/repositories/reservations/guests/guest-reservation-reader";
import { PrismaReservationRepository } from "@/infrastructure/db/prisma/repositories/reservations/reservation-repository";
import { PrismaCancellationRequestStore } from "@/infrastructure/db/prisma/repositories/reservations/cancellation-request-store";
import { PrismaBranchRepository } from "@/infrastructure/db/prisma/repositories/branches/branch-repository";
import { reservationMessageWriter } from "@/composition/reservation-jobs";
import { throttleKeys } from "@/composition/auth";
import { clientAddressFrom } from "@/composition/http";
import {
  whatsAppSender,
  whatsAppSetupReader,
} from "@/composition/notifications";
import { NodePhoneVerificationCrypto } from "@/infrastructure/crypto/phone-verification-crypto";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaGuestRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/guest-repository";
import { PrismaPhoneVerificationRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/phone-verification-repository";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";
import { Cuid2IdGenerator } from "@/infrastructure/ids/cuid2-id-generator";
import { getServerEnv } from "@/lib/env/server";

function dependencies(secret: string | undefined) {
  const client = getPrisma();
  return {
    unitOfWork: new PrismaReservationUnitOfWork<VerificationContext>(
      client,
      (transaction) => ({
        guests: new PrismaGuestRepository(transaction),
        verifications: new PrismaPhoneVerificationRepository(transaction),
      }),
    ),
    verifications: new PrismaPhoneVerificationRepository(client),
    crypto: secret ? new NodePhoneVerificationCrypto(secret) : null,
    clock: { now: () => new Date() },
    ids: new Cuid2IdGenerator(),
  };
}
export function requestPhoneVerification(input: unknown, headers: Headers) {
  const secret = getServerEnv().PHONE_VERIFICATION_SECRET;
  return new RequestPhoneVerification({
    ...dependencies(secret),
    setup: whatsAppSetupReader(),
    sender: whatsAppSender(),
  }).execute(
    input,
    throttleKeys().namespaced(
      "verification-request",
      clientAddressFrom(headers) || "anonymous",
    ),
  );
}
export function confirmPhoneVerification(id: unknown, input: unknown) {
  const secret = getServerEnv().PHONE_VERIFICATION_SECRET;
  return new ConfirmPhoneVerification(dependencies(secret)).execute(id, input);
}

/** S50 to S53 (M8-T11). */
export function staffGuests(
  options: Readonly<{
    client?: ReturnType<typeof getPrisma>;
    clock?: Clock;
  }> = {},
) {
  const client = options.client ?? getPrisma();
  const clock = options.clock ?? { now: () => new Date() };
  const reader = new PrismaGuestDirectoryReader(client);
  const history = new PrismaGuestHistoryReader(client);
  const unitOfWork = new PrismaReservationUnitOfWork<ChangeGuestBlockContext>(
    client,
    (transaction) => ({
      guests: new PrismaGuestRepository(transaction),
      verifications: new PrismaPhoneVerificationRepository(transaction),
      audit: new PrismaAuditLog(transaction),
    }),
  );
  const deps = { unitOfWork, reader, history, clock };
  return {
    list: new ListGuests(reader),
    get: new GetGuest(reader, history),
    block: new ChangeGuestBlock(deps, "BLOCK"),
    unblock: new ChangeGuestBlock(deps, "UNBLOCK"),
  };
}

/** G1, G3 and G4 (M8-T11). Bearer tokens are hashed here and never stored. */
export function guestReservationReads(
  options: Readonly<{
    client?: ReturnType<typeof getPrisma>;
    clock?: Clock;
  }> = {},
) {
  const session = guestReservationAccess(
    options.client ?? getPrisma(),
    options.clock,
  );
  return {
    view: new ViewGuestReservation(session),
    list: new ListGuestReservations(session),
    viewBySession: new ViewGuestSessionReservation(session),
  };
}

function guestReservationAccess(
  client: ReturnType<typeof getPrisma>,
  clock: Clock = { now: () => new Date() },
) {
  return {
    reader: new PrismaGuestReservationReader(client),
    crypto: new NodeBookingCrypto(),
    clock,
    verifications: new PrismaPhoneVerificationRepository(client),
    guests: new PrismaGuestRepository(client),
  };
}

export function requestCancellationContext(
  transaction: DatabaseClient,
): RequestCancellationContext {
  return {
    reservations: new PrismaReservationRepository(transaction),
    guests: new PrismaGuestRepository(transaction),
    verifications: new PrismaPhoneVerificationRepository(transaction),
    branches: new PrismaBranchRepository(transaction),
    cancellationRequests: new PrismaCancellationRequestStore(transaction),
    audit: new PrismaAuditLog(transaction),
    messages: reservationMessageWriter(transaction),
  };
}

export function requestCancellation(
  options: Readonly<{
    client?: ReturnType<typeof getPrisma>;
    clock?: Clock;
  }> = {},
) {
  const client = options.client ?? getPrisma();
  return new RequestCancellation({
    ...guestReservationAccess(client, options.clock),
    ids: new Cuid2IdGenerator(),
    unitOfWork: new PrismaReservationUnitOfWork(
      client,
      requestCancellationContext,
    ),
  });
}
