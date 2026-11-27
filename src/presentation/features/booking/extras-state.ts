import type { z } from "zod";

import type { MoneyDto } from "@/contracts/api/v1/primitives";
import type { QuoteResponse } from "@/contracts/api/v1/quotes";
import type { QuoteInput } from "@/presentation/api-client/quotes";

// The extras and coupon the journey holds (spec 0007): component state only,
// never storage or an address. Small on purpose: it loads with the first view.

export type Quote = NonNullable<z.output<typeof QuoteResponse>["quote"]>;
export type ServiceKind = Quote["services"][number]["kind"];
export type PaymentMethods = z.output<typeof QuoteResponse>["paymentMethods"];

/** A service the branch offers, as the server rendered it. */
export type OfferedService = Readonly<{
  kind: ServiceKind;
  unit: Quote["services"][number]["unit"];
  price: MoneyDto;
  childPrice: MoneyDto | null;
}>;

/** Why the current choices have no price. */
export type PriceProblem =
  | Readonly<{ kind: "retry" | "rate" | "cars"; message: string }>
  | Readonly<{ kind: "unavailable" | "closed" | "selection" }>;

/** A server price and the choices it answered. */
export type Priced = Readonly<{
  key: string;
  quote: Quote;
  paymentMethods: PaymentMethods;
}>;

export type Extras = Readonly<{
  breakfast: boolean;
  transfer: boolean;
  cars: number;
  flightDetails: string;
  /** What is typed in the coupon field and not yet accepted. */
  couponDraft: string;
  /** The code the server accepted. */
  appliedCode: string | null;
  /** A code sent to the server and not yet answered. */
  trying: string | null;
  couponError: string | null;
  /** The last code the server refused, until the field is edited. */
  refused: Readonly<{ code: string; reason: string }> | null;
  /** Something the server made the page take away. */
  notice: string | null;
  problem: PriceProblem | null;
  /** Services switched off since the page was loaded. */
  withdrawn: readonly ServiceKind[];
  priced: Priced;
}>;

/** The services of a price check. Flight details never change a price. */
export function requestedServices({
  breakfast,
  transfer,
  cars,
}: Pick<Extras, "breakfast" | "transfer" | "cars">): QuoteInput["services"] {
  return [
    ...(breakfast ? ["BREAKFAST" as const] : []),
    ...(transfer
      ? [{ kind: "AIRPORT_TRANSFER" as const, vehicles: cars }]
      : []),
  ];
}

export const priceKey = (
  services: QuoteInput["services"],
  couponCode: string | null,
) => JSON.stringify([services, couponCode]);

/** The code the next price check carries. */
export const sentCode = ({ trying, appliedCode }: Extras) =>
  trying ?? appliedCode;

/** Whether the held price is for exactly what is chosen now. */
export const isPriced = (extras: Extras) =>
  extras.problem === null &&
  extras.priced.key === priceKey(requestedServices(extras), sentCode(extras));

/** Nothing chosen, priced by the server rendered quote. */
export function initialExtras(
  quote: Quote,
  paymentMethods: PaymentMethods,
): Extras {
  return {
    breakfast: false,
    transfer: false,
    cars: 1,
    flightDetails: "",
    couponDraft: "",
    appliedCode: null,
    trying: null,
    couponError: null,
    refused: null,
    notice: null,
    problem: null,
    withdrawn: [],
    priced: { key: priceKey([], null), quote, paymentMethods },
  };
}
