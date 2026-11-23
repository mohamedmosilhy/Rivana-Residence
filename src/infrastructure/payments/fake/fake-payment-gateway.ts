import "server-only";

import { randomUUID } from "node:crypto";

import type {
  CheckoutFailure,
  CheckoutInput,
  CheckoutResult,
  PaymentCallbackInput,
  PaymentGateway,
  PaymentGatewayEvent,
  RefundInput,
  RefundResult,
  TransactionLookup,
} from "@/application/payments";
import type { Clock } from "@/application/shared/providers";

import { signedCallback, verifySignedCallback } from "./callback";

export const FAKE_CHECKOUT_ACTIONS = [
  "pay",
  "decline",
  "close",
  "delay-success",
  "deliver-delayed",
  "lose-callback",
  "complete-refund",
  "fail-refund",
] as const;
export type FakeCheckoutAction = (typeof FAKE_CHECKOUT_ACTIONS)[number];

type TransactionEvent = Extract<PaymentGatewayEvent, { kind: "TRANSACTION" }>;
type RefundEvent = Extract<PaymentGatewayEvent, { kind: "REFUND" }>;
type TransactionOutcome = TransactionEvent["outcome"];

type RefundAttempt = {
  readonly key: string;
  result: RefundResult & { providerRefundId: string };
  event?: RefundEvent;
};

type Session = {
  paymentId: string;
  checkout: Extract<CheckoutResult, { ok: true }> & { providerOrderId: string };
  providerTransactionId: string;
  amountMinor: number;
  currency: string;
  expiresAt: number;
  returnUrl: string;
  events: Partial<Record<TransactionOutcome, TransactionEvent>>;
  transaction?: TransactionEvent;
  delayed?: TransactionEvent;
  refund?: RefundAttempt;
  refunds: Map<string, RefundAttempt>;
};

type Simulation =
  | { status: "unavailable" | "scheduled" | "dropped" }
  | { status: "callback"; event: PaymentGatewayEvent };

export class FakePaymentGateway implements PaymentGateway {
  private readonly sessions = new Map<string, Session>();
  private readonly checkoutFailures = new Map<string, CheckoutFailure>();
  private readonly refundOutcomes = new Map<string, RefundResult["status"]>();
  private readonly callbackUrl: URL;

  constructor(
    private readonly options: Readonly<{
      origin: string;
      secret: string;
      clock: Clock;
      fetch?: typeof fetch;
    }>,
  ) {
    this.callbackUrl = new URL("/api/v1/payments/callback", options.origin);
  }

  setCheckoutFailure(paymentId: string, code: CheckoutFailure) {
    this.checkoutFailures.set(paymentId, code);
  }

  setRefundOutcome(paymentId: string, outcome: RefundResult["status"]) {
    this.refundOutcomes.set(paymentId, outcome);
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const previous = this.sessions.get(input.paymentId);
    if (previous) return previous.checkout;

    const failure = this.checkoutFailures.get(input.paymentId);
    if (failure) {
      this.checkoutFailures.delete(input.paymentId);
      return { ok: false, code: failure };
    }
    const expiresAt = input.expiresAt.getTime();
    const returnUrl = URL.parse(input.returnUrl);
    if (
      !/^[a-z0-9_-]{1,128}$/i.test(input.paymentId) ||
      !Number.isSafeInteger(input.amountMinor) ||
      input.amountMinor <= 0 ||
      !/^[A-Z]{3}$/.test(input.currency) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= this.options.clock.now().getTime() ||
      !returnUrl ||
      returnUrl.origin !== this.callbackUrl.origin ||
      returnUrl.username ||
      returnUrl.password
    ) {
      return { ok: false, code: "PROVIDER_REJECTED" };
    }

    const checkout = {
      ok: true,
      checkoutUrl: new URL(
        `/dev/fake-checkout/${input.paymentId}`,
        this.options.origin,
      ).href,
      providerOrderId: randomUUID(),
    } as const;
    this.sessions.set(input.paymentId, {
      paymentId: input.paymentId,
      checkout,
      providerTransactionId: randomUUID(),
      amountMinor: input.amountMinor,
      currency: input.currency,
      expiresAt,
      returnUrl: returnUrl.href,
      events: {},
      refunds: new Map(),
    });
    return checkout;
  }

  async verifyCallback(input: PaymentCallbackInput) {
    return verifySignedCallback(this.options.secret, input);
  }

  async getTransaction(input: TransactionLookup) {
    const session = this.sessions.get(input.paymentId);
    if (
      !session ||
      (input.providerOrderId !== undefined &&
        input.providerOrderId !== session.checkout.providerOrderId) ||
      (input.providerTransactionId !== undefined &&
        input.providerTransactionId !== session.providerTransactionId)
    ) {
      return "NOT_FOUND" as const;
    }
    if (
      this.hasExpired(session) &&
      session.transaction?.outcome !== "SUCCEEDED"
    ) {
      this.recordTransaction(session, "SESSION_CLOSED");
    }
    return (
      session.refund?.event ?? session.transaction ?? ("NOT_FOUND" as const)
    );
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const session = this.sessions.get(input.paymentId);
    if (
      !session ||
      session.transaction?.outcome !== "SUCCEEDED" ||
      session.providerTransactionId !== input.providerTransactionId ||
      session.amountMinor !== input.amountMinor ||
      session.currency !== input.currency ||
      !input.idempotencyKey
    ) {
      return { status: "FAILED" };
    }

    const previous = session.refunds.get(input.idempotencyKey);
    if (previous) return previous.result;

    if (session.refund && session.refund.result.status !== "FAILED") {
      session.refunds.set(input.idempotencyKey, session.refund);
      return session.refund.result;
    }

    const attempt: RefundAttempt = {
      key: input.idempotencyKey,
      result: { status: "PENDING", providerRefundId: randomUUID() },
    };
    session.refund = attempt;
    session.refunds.set(input.idempotencyKey, attempt);
    const status = this.refundOutcomes.get(input.paymentId) ?? "SUCCEEDED";
    this.refundOutcomes.delete(input.paymentId);
    if (status !== "PENDING") this.finishRefund(session, attempt, status);
    return attempt.result;
  }

  readCheckout(paymentId: string) {
    const session = this.sessions.get(paymentId);
    if (!session) return undefined;
    return {
      amountMinor: session.amountMinor,
      currency: session.currency,
      expiresAt: new Date(session.expiresAt),
      returnUrl: session.returnUrl,
    };
  }

  simulate(
    paymentId: string,
    action: FakeCheckoutAction,
    refundOutcome?: RefundResult["status"],
  ): Simulation {
    const session = this.sessions.get(paymentId);
    if (!session) return { status: "unavailable" };

    if (action === "deliver-delayed") {
      return session.delayed
        ? { status: "callback", event: session.delayed }
        : { status: "unavailable" };
    }
    if (action === "complete-refund" || action === "fail-refund") {
      const attempt = session.refund;
      if (!attempt) return { status: "unavailable" };
      const status = action === "complete-refund" ? "SUCCEEDED" : "FAILED";
      if (attempt.result.status === "PENDING")
        return {
          status: "callback",
          event: this.finishRefund(session, attempt, status),
        };
      return attempt.result.status === status && attempt.event
        ? { status: "callback", event: attempt.event }
        : { status: "unavailable" };
    }

    const previous = session.transaction?.outcome;
    if (previous === "SUCCEEDED" || previous === "SESSION_CLOSED") {
      // A browser retry sends the already recorded result after a delivery error.
      const retry =
        (action === "pay" && previous === "SUCCEEDED" && !session.delayed) ||
        (action === "close" && previous === "SESSION_CLOSED");
      return retry && session.transaction
        ? { status: "callback", event: session.transaction }
        : { status: "unavailable" };
    }

    if (action === "close")
      return {
        status: "callback",
        event: this.recordTransaction(session, "SESSION_CLOSED"),
      };
    if (this.hasExpired(session)) return { status: "unavailable" };
    if (action === "decline")
      return {
        status: "callback",
        event: this.recordTransaction(session, "DECLINED"),
      };

    if (refundOutcome) this.setRefundOutcome(paymentId, refundOutcome);
    const event = this.recordTransaction(session, "SUCCEEDED");
    if (action === "delay-success") {
      session.delayed = event;
      return { status: "scheduled" };
    }
    if (action === "lose-callback") return { status: "dropped" };
    return { status: "callback", event };
  }

  callbackFor(event: PaymentGatewayEvent) {
    return signedCallback(
      this.options.secret,
      new URL(this.callbackUrl),
      event,
    );
  }

  async deliverCallback(event: PaymentGatewayEvent) {
    const { rawBody, headers, url } = this.callbackFor(event);
    try {
      const response = await (this.options.fetch ?? fetch)(url, {
        method: "POST",
        body: Buffer.from(rawBody),
        headers,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      });
      await response.body?.cancel();
      return response.ok;
    } catch {
      return false;
    }
  }

  private hasExpired(session: Session) {
    return this.options.clock.now().getTime() >= session.expiresAt;
  }

  private eventFields(session: Session) {
    return {
      providerEventId: randomUUID(),
      paymentId: session.paymentId,
      providerTransactionId: session.providerTransactionId,
      amountMinor: session.amountMinor,
      currency: session.currency,
    };
  }

  private recordTransaction(session: Session, outcome: TransactionOutcome) {
    const event = (session.events[outcome] ??= {
      ...this.eventFields(session),
      kind: "TRANSACTION",
      outcome,
    });
    session.transaction = event;
    return event;
  }

  private finishRefund(
    session: Session,
    attempt: RefundAttempt,
    status: "SUCCEEDED" | "FAILED",
  ): RefundEvent {
    attempt.result = { ...attempt.result, status };
    attempt.event = {
      ...this.eventFields(session),
      kind: "REFUND",
      outcome: status === "SUCCEEDED" ? "REFUND_SUCCEEDED" : "REFUND_FAILED",
      refundAttemptKey: attempt.key,
    };
    return attempt.event;
  }
}
