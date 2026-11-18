import "server-only";
import {
  RequestPhoneVerification,
  ConfirmPhoneVerification,
  type VerificationContext,
} from "@/application/guests";
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
