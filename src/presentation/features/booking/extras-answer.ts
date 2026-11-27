import type { QuoteInput } from "@/presentation/api-client/quotes";
import type { ApiProblem } from "@/presentation/api-client/result";

import {
  priceKey,
  type Extras,
  type PriceProblem,
  type ServiceKind,
} from "./extras-state";
import type { QuoteResult } from "./selection-quote";
import { waitText } from "./verification-state";

export const serviceName: Record<ServiceKind, string> = {
  BREAKFAST: "Breakfast",
  AIRPORT_TRANSFER: "Airport transfer",
};

const REFUSALS: Readonly<Record<string, string>> = {
  NOT_FOUND: "We don’t recognise this code. Check the spelling.",
  INACTIVE: "This code is not active.",
  NOT_YET_VALID: "This code cannot be used yet.",
  EXPIRED: "This code has expired.",
  WRONG_BRANCH: "This code cannot be used at this branch.",
  LIMIT_REACHED: "This code has been used the maximum number of times.",
  PHONE_LIMIT_REACHED:
    "You have already used this code the maximum number of times.",
};

/** Plain words for a refused coupon (CP-7). */
export const couponRefusal = (reason: unknown) =>
  (typeof reason === "string" && Object.hasOwn(REFUSALS, reason)
    ? REFUSALS[reason]
    : undefined) ?? "This code cannot be used for this booking.";

function problemFor(problem: ApiProblem): PriceProblem {
  if (problem.code === "RATE_LIMITED")
    return {
      kind: "rate",
      message: `Too many price checks. Try again in ${waitText((problem.retryAfter ?? 60) * 1000)}.`,
    };
  if (problem.code === "NOT_FOUND") return { kind: "closed" };
  if (problem.code === "VALIDATION") {
    const cars = Object.entries(problem.fieldErrors ?? {}).find(([field]) =>
      /^services\.\d+\.vehicles$/.test(field),
    );
    return cars
      ? { kind: "cars", message: cars[1].join(" ") }
      : { kind: "selection" };
  }
  return {
    kind: "retry",
    message: "We couldn’t check the price. Please try again.",
  };
}

/** A second removal is added to the first, not shown in its place. */
const noted = (extras: Extras, notice: string) =>
  extras.notice ? `${extras.notice} ${notice}` : notice;

/** The journey after the server answered the price check it was sent. */
export function priceAnswered(
  extras: Extras,
  sent: QuoteInput,
  result: QuoteResult,
): Extras {
  const code = sent.couponCode ?? null;
  const tried = code !== null && code === extras.trying;

  if (result.ok) {
    const { available, bookable, quote, paymentMethods } = result.data;
    if (!available || !quote)
      return { ...extras, problem: { kind: "unavailable" } };
    if (!bookable) return { ...extras, problem: { kind: "closed" } };
    // The server's spelling of the code, so the key matches the next check.
    const { coupon } = quote;
    const appliedCode = coupon?.code ?? null;
    return {
      ...extras,
      appliedCode,
      trying: null,
      couponDraft: tried ? "" : extras.couponDraft,
      couponError: tried ? null : extras.couponError,
      problem: null,
      priced: {
        key: priceKey(sent.services, appliedCode),
        quote,
        paymentMethods,
      },
    };
  }

  const { problem } = result;
  if (problem.code === "ABORTED") return extras;

  if (problem.code === "COUPON_INVALID" && code !== null) {
    const reason = couponRefusal(problem.context?.reason);
    // A new code is refused: any accepted code, and its total, stay.
    if (tried)
      return {
        ...extras,
        trying: null,
        couponError: reason,
        refused: { code: code.toUpperCase(), reason },
      };
    return {
      ...extras,
      appliedCode: null,
      notice: noted(extras, `The code ${code} was removed. ${reason}`),
    };
  }

  // Only a service that was asked for: removing anything else would change
  // nothing, and the page would wait for a price it never asks for again.
  const kind = sent.services
    .map((service) => (typeof service === "string" ? service : service.kind))
    .find((asked) => asked === problem.context?.kind);
  if (problem.code === "SERVICE_UNAVAILABLE" && kind)
    return {
      ...extras,
      ...(kind === "BREAKFAST" ? { breakfast: false } : { transfer: false }),
      withdrawn: [...extras.withdrawn, kind],
      notice: noted(
        extras,
        `${serviceName[kind]} is no longer available, so we removed it.`,
      ),
    };

  return { ...extras, problem: problemFor(problem) };
}
