import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import {
  developmentPaymentCheckout,
  FAKE_CHECKOUT_ACTIONS,
} from "@/composition/payment-gateway";

export const metadata: Metadata = {
  title: "Simulated checkout",
  robots: { index: false, follow: false },
};

const messages = {
  sent: "The payment endpoint accepted the simulated notification.",
  "delivery-failed":
    "The payment endpoint did not acknowledge the notification. You can retry the action.",
  scheduled:
    "Payment recorded. Use Deliver delayed success when you are ready.",
  dropped: "Payment recorded. Callback delivery was skipped.",
  unavailable: "That action is unavailable for this checkout.",
} as const;

const labels = {
  pay: "Pay successfully",
  decline: "Decline payment",
  close: "Close checkout",
  "delay-success": "Record success for later delivery",
  "deliver-delayed": "Deliver delayed success",
  "lose-callback": "Record success without a callback",
  "complete-refund": "Complete pending refund",
  "fail-refund": "Fail pending refund",
} satisfies Record<(typeof FAKE_CHECKOUT_ACTIONS)[number], string>;

const buttonClass =
  "rounded-md border border-slate-400 px-3 py-2 text-left font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2";

export default async function FakeCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<{ result?: string | string[] }>;
}) {
  await connection();
  const gateway = developmentPaymentCheckout();
  if (!gateway) notFound();
  const { paymentId } = await params;
  const checkout = gateway.readCheckout(paymentId);
  if (!checkout) notFound();

  const { result } = await searchParams;
  const message = Object.entries(messages).find(
    ([code]) => code === result,
  )?.[1];
  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: checkout.currency,
    currencyDisplay: "code",
  });
  const minorDigits = currency.resolvedOptions().maximumFractionDigits ?? 2;
  const amount = currency.format(checkout.amountMinor / 10 ** minorDigits);

  return (
    <main className="mx-auto max-w-xl px-6 py-12 text-slate-900">
      <h1 className="text-3xl font-semibold">Simulated checkout</h1>
      <p className="mt-3">Development only. No real money is charged.</p>
      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt>Amount</dt>
        <dd className="font-semibold">{amount}</dd>
        <dt>Expires</dt>
        <dd>
          <time dateTime={checkout.expiresAt.toISOString()}>
            {checkout.expiresAt.toISOString()}
          </time>
        </dd>
      </dl>
      {message && (
        <p className="mt-6 rounded-md bg-slate-100 p-3" role="status">
          {message}
        </p>
      )}
      <form
        action={`/dev/fake-checkout/${encodeURIComponent(paymentId)}/submit`}
        method="post"
        className="mt-6 grid gap-3"
      >
        <div className="grid gap-1">
          <label htmlFor="refund-outcome">
            Initial refund result for this payment
          </label>
          <select
            id="refund-outcome"
            name="refundOutcome"
            className={buttonClass}
          >
            <option value="SUCCEEDED">Succeeded</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
        {FAKE_CHECKOUT_ACTIONS.map((value) => (
          <button
            key={value}
            className={buttonClass}
            type="submit"
            name="action"
            value={value}
          >
            {labels[value]}
          </button>
        ))}
      </form>
      <a className="mt-6 inline-block underline" href={checkout.returnUrl}>
        Return to booking
      </a>
    </main>
  );
}
