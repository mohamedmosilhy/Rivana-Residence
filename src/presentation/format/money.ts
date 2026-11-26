import type { MoneyDto } from "@/contracts/api/v1/primitives";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/**
 * Display text for a server amount: an API `Money` or a `*Minor` integer of
 * cents (ADR 020). Display only; the browser never adds up prices.
 */
export function formatMoney(amount: MoneyDto | number) {
  const minor = typeof amount === "number" ? amount : amount.amountMinor;
  return usd.format(minor / 100);
}
