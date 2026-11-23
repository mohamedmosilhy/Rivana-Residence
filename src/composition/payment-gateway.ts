import "server-only";

import type { PaymentGateway } from "@/application/payments";
import { FakePaymentGateway } from "@/infrastructure/payments/fake/fake-payment-gateway";
import { getServerEnv } from "@/lib/env/server";

export { FAKE_CHECKOUT_ACTIONS } from "@/infrastructure/payments/fake/fake-payment-gateway";

const paymentGateways = {
  fake: {
    readiness: "fake",
    connect: fakeGateway,
  },
} as const;

// Next can load the page and handlers through different server bundles.
// They share one fake gateway while running in the same process.
const processState = globalThis as typeof globalThis & {
  rivanaFakePaymentGateway?: {
    origin: string;
    secret: string;
    gateway: FakePaymentGateway;
  };
};

function fakeGateway() {
  const env = getServerEnv();
  const origin = new URL(env.APP_URL).origin;
  const secret =
    env.PAYMENT_FAKE_SECRET ?? "rivana-dev-fake-payment-signing-only";
  const current = processState.rivanaFakePaymentGateway;
  if (current?.origin === origin && current.secret === secret)
    return current.gateway;

  const gateway = new FakePaymentGateway({
    origin,
    secret,
    clock: { now: () => new Date() },
  });
  processState.rivanaFakePaymentGateway = { origin, secret, gateway };
  return gateway;
}

function selectedPaymentGateway() {
  const provider = getServerEnv().PAYMENT_PROVIDER;
  return provider ? paymentGateways[provider] : undefined;
}

export function paymentGatewayReadiness() {
  return selectedPaymentGateway()?.readiness ?? "unconfigured";
}

export function paymentGateway(): PaymentGateway | undefined {
  return selectedPaymentGateway()?.connect();
}

export function developmentPaymentCheckout() {
  // Reject the route even when production has invalid fake configuration.
  if (process.env.NODE_ENV === "production") return undefined;
  if (getServerEnv().PAYMENT_PROVIDER === "fake") return fakeGateway();
}
