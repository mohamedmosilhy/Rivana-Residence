import { z } from "zod";

import { issuesFromZod, type DomainIssue } from "@/domain/shared/domain-error";
import { Money } from "@/domain/shared/money";

import { isServiceKind, type ServiceKind } from "./service-kind";
import {
  SERVICE_PRICE_UNITS,
  isPersonUnit,
  type ServicePriceUnit,
} from "./service-price-unit";

export const SERVICE_DESCRIPTION_MAX = 300;
/** The largest value the `INTEGER` price columns hold. */
export const SERVICE_PRICE_MAX_MINOR = 2_147_483_647;

type Parsed<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly DomainIssue[] }>;

export type ServiceOfferingInput = Readonly<{
  priceUnit: ServicePriceUnit;
  price: Money;
  childPrice: Money | null;
  active: boolean;
  description: string | null;
}>;

/** A branch's stored offering as the quote needs it. */
export type ServiceOffering = Readonly<{
  kind: ServiceKind;
  unit: ServicePriceUnit;
  price: Money;
  childPrice: Money | null;
  active: boolean;
}>;

const amount = z
  .object({
    amountMinor: z
      .number()
      .int()
      .min(1, "Enter a positive amount.")
      .max(SERVICE_PRICE_MAX_MINOR, "The amount is too large."),
    currency: z.literal("USD"),
  })
  .strict();

const offeringSchema = z
  .object({
    priceUnit: z.enum(SERVICE_PRICE_UNITS),
    price: amount,
    childPrice: amount.nullable().optional(),
    active: z.boolean(),
    description: z
      .string()
      .trim()
      .max(
        SERVICE_DESCRIPTION_MAX,
        `Use at most ${SERVICE_DESCRIPTION_MAX} characters.`,
      )
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.childPrice != null && !isPersonUnit(value.priceUnit)) {
      context.addIssue({
        code: "custom",
        path: ["childPrice"],
        message: "A child price applies only to per person prices.",
      });
    }
  });

function issues(error: z.ZodError): readonly DomainIssue[] {
  return issuesFromZod(error.issues).map((issue) =>
    issue.path === "" ? { ...issue, path: "_root" } : issue,
  );
}

/** The staff body for one service at one branch (S36). The branch is not input. */
export function parseServiceOfferingInput(
  input: unknown,
): Parsed<ServiceOfferingInput> {
  const parsed = offeringSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: issues(parsed.error) };
  const { priceUnit, price, childPrice, active, description } = parsed.data;
  return {
    ok: true,
    value: {
      priceUnit,
      price: Money.create(price),
      childPrice: childPrice ? Money.create(childPrice) : null,
      active,
      description: description ? description : null,
    },
  };
}

export type RequestedServices =
  | Readonly<{ ok: true; services: readonly ServiceOffering[] }>
  | Readonly<{ ok: false; kind: ServiceKind }>
  | Readonly<{ ok: false; issues: readonly DomainIssue[] }>;

/**
 * SV-2: a service joins the quote only when it was requested. A requested
 * service with no offering, or an inactive one, refuses the whole quote
 * (the API reports it as SERVICE_UNAVAILABLE). Unrequested services are never
 * returned, even when active. The order is the request order.
 */
export function selectRequestedServices(
  requested: unknown,
  offerings: readonly ServiceOffering[],
): RequestedServices {
  if (!Array.isArray(requested))
    return {
      ok: false,
      issues: [{ path: "services", message: "Send a list of services." }],
    };
  const seen = new Set<ServiceKind>();
  for (const [index, kind] of requested.entries()) {
    if (!isServiceKind(kind))
      return {
        ok: false,
        issues: [
          { path: `services.${index}`, message: "Use a supported service." },
        ],
      };
    if (seen.has(kind))
      return {
        ok: false,
        issues: [
          { path: `services.${index}`, message: "Choose each service once." },
        ],
      };
    seen.add(kind);
  }
  const services: ServiceOffering[] = [];
  for (const kind of seen) {
    const offering = offerings.find((candidate) => candidate.kind === kind);
    if (!offering || !offering.active) return { ok: false, kind };
    services.push(offering);
  }
  return { ok: true, services: Object.freeze(services) };
}
