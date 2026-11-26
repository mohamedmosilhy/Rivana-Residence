import type { CreateWebsiteReservation } from "@/application/reservations";
import type { PrismaClient } from "@/generated/prisma/client";

import {
  callbackEvent,
  paymentCallback,
  PROVIDER,
  signed,
} from "./payment-callback";
import { bookingBody, issueToken, websiteBooking } from "./website-booking";

/** A gateway that always opens a hosted checkout. */
export const openCheckout = {
  provider: PROVIDER,
  appUrl: "https://hotel.example",
  gateway: {
    createCheckout: async () => ({
      ok: true as const,
      checkoutUrl: "https://gateway.example.test/checkout",
      providerOrderId: "order-1",
    }),
  },
} satisfies NonNullable<
  ConstructorParameters<typeof CreateWebsiteReservation>[0]["checkout"]
>;

/** Email verified bookings need a branch that takes online payment (Q-100). */
export const allowOnlinePayment = (client: PrismaClient, slug = "new-cairo") =>
  client.branch.update({
    where: { slug },
    data: { onlinePaymentEnabled: true },
  });

/**
 * A booking verified by email, which is always paid online (Q-100). With
 * `paid`, the gateway callback confirms it; otherwise it stays an open hold.
 */
export async function bookByEmailOnline(
  client: PrismaClient,
  input: Readonly<{
    phone: string;
    email: string;
    key: string;
    body?: Record<string, unknown>;
    paid?: boolean;
  }>,
) {
  await allowOnlinePayment(client);
  const token = await issueToken(client, input.phone, { email: input.email });
  const created = await websiteBooking(client, {
    checkout: openCheckout,
  }).execute(
    bookingBody(input.phone, token, {
      paymentMethod: "ONLINE",
      guest: {
        fullName: "Amina Hassan",
        email: input.email,
        phone: input.phone,
        country: "EG",
      },
      ...input.body,
    }),
    input.key,
  );
  if (!created.ok) throw new Error(JSON.stringify(created.error));
  const find = () =>
    client.reservation.findUniqueOrThrow({
      where: { reference: created.value.reference },
    });
  if (input.paid) {
    const payment = await client.payment.findFirstOrThrow({
      where: { reservationId: (await find()).id },
    });
    const captured = await paymentCallback(client).useCase.execute(
      signed(callbackEvent(payment)),
    );
    if (!captured.ok) throw new Error(JSON.stringify(captured.error));
  }
  return {
    reference: created.value.reference,
    manageToken: created.value.manageToken!,
    row: await find(),
  };
}
