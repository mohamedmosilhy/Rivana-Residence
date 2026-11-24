import type {
  BookingPaymentStore,
  CheckoutResult,
  PaymentGateway,
} from "@/application/payments";
import type { Clock } from "@/application/shared/providers";
import { failure, success, type Result } from "@/application/shared/result";
import { HoldPolicy } from "@/domain/payments";

import { endBookingPaymentHold } from "./booking-payment-holds";
import type {
  CreateWebsiteReservationContext,
  WebsiteReservationResult,
} from "./create-website-reservation";
import type { WebsiteBookingInput } from "./create-website-reservation-input";
import type { ReservationRepository, ReservationUnitOfWork } from "./ports";

export type WebsiteCheckoutConnection = Readonly<{
  provider: string;
  gateway: Pick<PaymentGateway, "createCheckout">;
  appUrl: string;
}>;

const unavailable = () =>
  failure(
    "PAYMENT_UNAVAILABLE",
    "Checkout could not be opened. Please try again.",
  );

/** Runs only after booking commits, or after a replay has matched its fingerprint. */
export async function openWebsiteCheckout(
  deps: {
    checkout?: WebsiteCheckoutConnection;
    payments: Pick<BookingPaymentStore, "findInitiated">;
    reservations: Pick<ReservationRepository, "findById">;
    unitOfWork: ReservationUnitOfWork<CreateWebsiteReservationContext>;
    clock: Clock;
  },
  booking: WebsiteBookingInput,
  result: WebsiteReservationResult,
): Promise<Result<WebsiteReservationResult>> {
  const { reservationId, branchId, holdExpiresAt } = result;
  if (result.status !== "AWAITING_PAYMENT") return success(result);
  if (!holdExpiresAt)
    throw new Error("An awaiting reservation has no hold deadline.");

  const payment = await deps.payments.findInitiated(reservationId);
  if (!payment) {
    if (!result.replayed) return unavailable();
    const current = await deps.reservations.findById(branchId, reservationId);
    return success({ ...result, status: current?.status ?? result.status });
  }
  if (HoldPolicy.isExpired(payment.expiresAt, deps.clock.now()))
    return result.replayed ? success(result) : unavailable();
  if (payment.checkoutUrl)
    return success({ ...result, checkoutUrl: payment.checkoutUrl });

  const { checkout } = deps;
  if (!checkout || payment.provider !== checkout.provider) return unavailable();
  const returnUrl = new URL(
    `/${encodeURIComponent(booking.quote.branchSlug)}/book/payment`,
    checkout.appUrl,
  ).href;
  let opened: CheckoutResult;
  try {
    opened = await checkout.gateway.createCheckout({
      paymentId: payment.id,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      reference: result.reference,
      customer: {
        name: booking.contact.fullName,
        email: booking.contact.email!,
      },
      expiresAt: payment.expiresAt,
      returnUrl,
    });
  } catch {
    return unavailable();
  }
  if (!opened.ok && opened.code === "UNAVAILABLE") return unavailable();

  const persisted = await deps.unitOfWork.run(async (context) => {
    const locked = await context.reservations.lockById(branchId, reservationId);
    if (!locked.ok) return locked;
    const current = locked.value;
    if (!current) throw new Error("The checkout reservation no longer exists.");
    const state = {
      status: current.status,
      checkoutUrl: null as string | null,
      refused: false,
    };
    if (current.status !== "AWAITING_PAYMENT") return success(state);
    const active = await context.payments.findInitiated(reservationId);
    if (active?.id !== payment.id) return success(state);
    const now = deps.clock.now();
    if (active.checkoutUrl)
      return success({
        ...state,
        checkoutUrl: HoldPolicy.isExpired(active.expiresAt, now)
          ? null
          : active.checkoutUrl,
      });
    if (!opened.ok) {
      await endBookingPaymentHold(context, current, active, "FAILED", now);
      return success({
        ...state,
        status: "PAYMENT_FAILED" as const,
        refused: true,
      });
    }

    await context.payments.saveCheckout(active.id, opened);
    return success({
      ...state,
      checkoutUrl: HoldPolicy.isExpired(active.expiresAt, now)
        ? null
        : opened.checkoutUrl,
    });
  });
  if (!persisted.ok) return persisted;
  if (persisted.value.checkoutUrl)
    return success({ ...result, checkoutUrl: persisted.value.checkoutUrl });
  if (result.replayed && !persisted.value.refused)
    return success({ ...result, status: persisted.value.status });
  return unavailable();
}
