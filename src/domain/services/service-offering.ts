import { z } from "zod";

import { issuesFromZod, type DomainIssue } from "@/domain/shared/domain-error";
import { Money } from "@/domain/shared/money";

import { SERVICE_KINDS, type ServiceKind } from "./service-kind";
import {
  SERVICE_MAX_VEHICLES,
  SERVICE_PRICE_UNITS,
  isPersonUnit,
  type ServicePriceUnit,
} from "./service-price-unit";

export const SERVICE_DESCRIPTION_MAX = 300;
/** SV-5: a transfer offering's maximum when staff leave it out. */
export const SERVICE_DEFAULT_MAX_VEHICLES = 3;
/** The largest value the `INTEGER` price columns hold. */
export const SERVICE_PRICE_MAX_MINOR = 2_147_483_647;

type Parsed<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly DomainIssue[] }>;

export type ServiceOfferingInput = Readonly<{
  priceUnit: ServicePriceUnit;
  price: Money;
  childPrice: Money | null;
  /** SV-5: 1–10 for the airport transfer (default 3), null for breakfast. */
  maxVehicles: number | null;
  active: boolean;
  description: string | null;
}>;

/** A branch's stored offering as the quote needs it. */
export type ServiceOffering = Readonly<{
  kind: ServiceKind;
  unit: ServicePriceUnit;
  price: Money;
  childPrice: Money | null;
  /** SV-5: the transfer's car limit; null for breakfast. */
  maxVehicles: number | null;
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
    maxVehicles: z
      .number()
      .int()
      .min(1, "Choose from 1 to 10 cars.")
      .max(SERVICE_MAX_VEHICLES, "Choose from 1 to 10 cars.")
      .nullable()
      .optional(),
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
  kind: ServiceKind,
): Parsed<ServiceOfferingInput> {
  const parsed = offeringSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: issues(parsed.error) };
  const { priceUnit, price, childPrice, active, description } = parsed.data;
  if (
    kind === "BREAKFAST" &&
    (priceUnit === "PER_VEHICLE" || parsed.data.maxVehicles != null)
  )
    return {
      ok: false,
      issues: [
        {
          path: priceUnit === "PER_VEHICLE" ? "priceUnit" : "maxVehicles",
          message: "Cars apply only to airport transfers.",
        },
      ],
    };
  // S36 is a full replacement: an omitted or null maximum for the transfer
  // stores the default (SV-5), never "keep the previous value".
  const maxVehicles =
    kind === "BREAKFAST"
      ? null
      : (parsed.data.maxVehicles ?? SERVICE_DEFAULT_MAX_VEHICLES);
  return {
    ok: true,
    value: {
      priceUnit,
      maxVehicles,
      price: Money.create(price),
      childPrice: childPrice ? Money.create(childPrice) : null,
      active,
      description: description ? description : null,
    },
  };
}

const serviceKind = z.enum(SERVICE_KINDS, "Use a supported service.");

/**
 * An optional car count. Checked by hand, not with z.number().int(): Zod 4
 * treats a type or .int() failure as a mismatch of the whole union branch,
 * which would report "Use a supported service." instead of this field. Every
 * wrong value (null, a string, a fraction, out of range) is a field error.
 */
const carCount = z
  .unknown()
  .superRefine((value, context) => {
    if (value === undefined) return;
    if (typeof value !== "number" || !Number.isInteger(value))
      context.addIssue({
        code: "custom",
        message: "Choose a whole number of cars.",
      });
    else if (value < 1 || value > SERVICE_MAX_VEHICLES)
      context.addIssue({
        code: "custom",
        message: "Choose from 1 to 10 cars.",
      });
  })
  .transform((value) => value as number | undefined);

/**
 * One requested service (P6, P7): a bare kind, or an object that may carry
 * the transfer's car count and plain-text details (SV-5). No price key is
 * accepted; the object is strict.
 */
export const serviceInputSchema = z.union(
  [
    serviceKind,
    z
      .object({
        kind: serviceKind,
        vehicles: carCount.optional(),
        details: z
          .string()
          .trim()
          .max(SERVICE_DESCRIPTION_MAX, "Use at most 300 characters.")
          .refine(
            (value) => !/[\p{Cc}\p{Cf}]/u.test(value),
            "Use plain text without control characters.",
          )
          .optional(),
      })
      .strict(),
  ],
  "Use a supported service.",
);

/** A parsed request item. Clients send the same shape (see the P6 contract). */
export type ServiceInput = z.output<typeof serviceInputSchema>;

/** An offering chosen for a quote, with the request's car count and details. */
export type SelectedService = ServiceOffering &
  Readonly<{ vehicles: number | null; details: string | null }>;

export type RequestedServices =
  | Readonly<{ ok: true; services: readonly SelectedService[] }>
  | Readonly<{ ok: false; kind: ServiceKind }>
  | Readonly<{ ok: false; issues: readonly DomainIssue[] }>;

type NormalizedService = Readonly<{
  kind: ServiceKind;
  vehicles: number | undefined;
  details: string | undefined;
}>;

const fieldIssue = (path: string, message: string): RequestedServices => ({
  ok: false,
  issues: [{ path, message }],
});

/**
 * SV-2 and SV-5: a service joins the quote only when it was requested. The
 * whole list is validated first (shape, duplicates, a car count on
 * breakfast), so a malformed request is a field error before any offering is
 * consulted. Then a requested service with no offering, or an inactive one,
 * refuses the whole quote (the API reports it as SERVICE_UNAVAILABLE), and a
 * transfer's car count is checked against the branch's maximum. Unrequested
 * services are never returned, even when active. The order is the request
 * order. An omitted car count is one car.
 */
export function selectRequestedServices(
  requested: unknown,
  offerings: readonly ServiceOffering[],
): RequestedServices {
  if (!Array.isArray(requested))
    return fieldIssue("services", "Send a list of services.");
  const seen = new Set<ServiceKind>();
  const normalized: NormalizedService[] = [];
  for (const [index, raw] of requested.entries()) {
    const item = serviceInputSchema.safeParse(raw);
    if (!item.success)
      return {
        ok: false,
        issues: issuesFromZod(item.error.issues).map((issue) => ({
          ...issue,
          path: `services.${index}${issue.path ? "." + issue.path : ""}`,
        })),
      };
    const value: NormalizedService =
      typeof item.data === "string"
        ? { kind: item.data, vehicles: undefined, details: undefined }
        : {
            kind: item.data.kind,
            vehicles: item.data.vehicles,
            details: item.data.details,
          };
    if (seen.has(value.kind))
      return fieldIssue(`services.${index}`, "Choose each service once.");
    if (value.kind !== "AIRPORT_TRANSFER" && value.vehicles !== undefined)
      return fieldIssue(
        `services.${index}.vehicles`,
        "Cars apply only to airport transfers.",
      );
    seen.add(value.kind);
    normalized.push(value);
  }
  const services: SelectedService[] = [];
  for (const [index, value] of normalized.entries()) {
    const offering = offerings.find(
      (candidate) => candidate.kind === value.kind,
    );
    if (!offering || !offering.active) return { ok: false, kind: value.kind };
    let vehicles: number | null = null;
    if (value.kind === "AIRPORT_TRANSFER") {
      // The database requires a maximum on every transfer offering; a missing
      // one fails closed as unavailable rather than guessing a limit.
      if (offering.maxVehicles === null) return { ok: false, kind: value.kind };
      vehicles = value.vehicles ?? 1;
      if (vehicles > offering.maxVehicles)
        return fieldIssue(
          `services.${index}.vehicles`,
          `Choose from 1 to ${offering.maxVehicles} cars.`,
        );
    }
    // Details are trimmed by the schema; blank text is stored as no details.
    services.push({ ...offering, vehicles, details: value.details || null });
  }
  return { ok: true, services: Object.freeze(services) };
}
