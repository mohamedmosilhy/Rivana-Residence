import { z } from "zod";
import {
  PhoneNumber,
  parseGuestContact,
  type GuestContact,
} from "@/domain/guests";
import {
  QuoteCalculator,
  type Quote,
  type QuoteCouponValue,
  type QuoteServiceLine,
} from "@/domain/pricing";
import { SERVICE_KINDS } from "@/domain/services";
import { DomainValidationError } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { Money } from "@/domain/shared/money";
import { Occupancy } from "@/domain/shared/occupancy";
import { StayRange } from "@/domain/shared/stay-range";
import {
  RESERVATION_SOURCES,
  RESERVATION_STATUSES,
  PAYMENT_METHODS,
  RESERVATION_PAYMENT_STATUSES,
  type ReservationSource,
  type ReservationStatus,
  type PaymentMethod,
  type ReservationPaymentStatus,
} from "@/domain/shared/types";
import { consumesInventory } from "./state-machine";

export type ReservationNightSnapshot = Readonly<{
  night: LocalDate;
  amount: Money | null;
  source: "BASE" | "PERIOD" | "MANUAL" | null;
}>;
export type ReservationLine = Readonly<{
  branchId: string;
  roomTypeId: string;
  stay: StayRange;
  occupancy: Occupancy;
  consumesInventory: boolean;
  listing: Readonly<{
    id: string;
    branchId: string;
    maxAdults: number;
    maxChildren: number;
  }>;
  physicalUnit: Readonly<{
    id: string;
    branchId: string;
    roomTypeId: string;
  }> | null;
  nights: readonly ReservationNightSnapshot[];
  subtotal: Money | null;
}>;
export type ReservationSnapshot = Readonly<
  Pick<
    Quote,
    | "accommodationMinor"
    | "servicesMinor"
    | "subtotalMinor"
    | "discountMinor"
    | "taxableMinor"
    | "vatRateBasisPoints"
    | "vatMinor"
    | "totalMinor"
  > & {
    serviceLines: readonly QuoteServiceLine[];
    couponValue: QuoteCouponValue | null;
  }
>;
export type ReservationRecord = Readonly<{
  branchId: string;
  source: ReservationSource;
  status: ReservationStatus;
  stay: StayRange;
  paymentMethod: PaymentMethod;
  paymentStatus: ReservationPaymentStatus;
  guestId: string | null;
  contact: GuestContact;
  externalReference: string | null;
  lines: readonly ReservationLine[];
  snapshot: ReservationSnapshot | null;
}>;

function invalid(path: string, message: string): never {
  throw new DomainValidationError("The reservation is invalid.", [
    { path, message },
  ]);
}
const sameStay = (left: StayRange, right: StayRange) =>
  left.checkIn.compare(right.checkIn) === 0 &&
  left.checkOut.compare(right.checkOut) === 0;
const id = z.string().min(1).max(32);

/** Structural R-1/2/3/6/7. No database lookup, uniqueness claim, authorization, or availability check. */
export function validateReservationStructure(record: ReservationRecord): void {
  if (
    !id.safeParse(record.branchId).success ||
    !RESERVATION_SOURCES.includes(record.source) ||
    !RESERVATION_STATUSES.includes(record.status) ||
    !PAYMENT_METHODS.includes(record.paymentMethod) ||
    !RESERVATION_PAYMENT_STATUSES.includes(record.paymentStatus) ||
    !(record.stay instanceof StayRange)
  )
    invalid("reservation", "Supply valid reservation values.");
  if (
    record.contact.phone !== null &&
    !(record.contact.phone instanceof PhoneNumber)
  )
    invalid("guest.phone", "Supply a PhoneNumber value or no phone.");
  parseGuestContact({
    ...record.contact,
    phone: record.contact.phone?.value ?? null,
  });
  if (record.lines.length < 1) invalid("lines", "Supply at least one unit.");
  if (
    record.source === "EXTERNAL" &&
    (typeof record.externalReference !== "string" ||
      !record.externalReference.trim() ||
      record.externalReference.length > 80 ||
      /[\p{Cc}\p{Cf}]/u.test(record.externalReference))
  )
    invalid(
      "externalReference",
      "An external reservation needs a bounded reference.",
    );
  const assigned = new Set<string>();
  for (const [index, line] of record.lines.entries()) {
    const path = `lines.${index}`;
    if (
      line.branchId !== record.branchId ||
      line.listing.branchId !== record.branchId ||
      line.roomTypeId !== line.listing.id
    )
      invalid(
        path,
        "All units and listings must belong to the reservation branch.",
      );
    if (!(line.stay instanceof StayRange) || !sameStay(line.stay, record.stay))
      invalid(`${path}.stay`, "Every unit must use the reservation stay.");
    if (
      !(line.occupancy instanceof Occupancy) ||
      !Number.isSafeInteger(line.listing.maxAdults) ||
      line.listing.maxAdults < 1 ||
      !Number.isSafeInteger(line.listing.maxChildren) ||
      line.listing.maxChildren < 0 ||
      !line.occupancy.fits(line.listing)
    )
      invalid(`${path}.occupancy`, "Occupancy must fit the listing.");
    if (line.consumesInventory !== consumesInventory(record.status))
      invalid(
        `${path}.consumesInventory`,
        "Consumption must match the reservation status.",
      );
    if (line.physicalUnit !== null) {
      const unit = line.physicalUnit;
      if (
        unit.branchId !== record.branchId ||
        unit.roomTypeId !== line.roomTypeId ||
        assigned.has(unit.id)
      )
        invalid(
          `${path}.physicalUnit`,
          "Assign distinct units from the same listing and branch.",
        );
      assigned.add(unit.id);
    } else if (record.status === "CHECKED_IN")
      invalid(
        `${path}.physicalUnit`,
        "Every checked-in unit must be assigned.",
      );
  }
}

/** R-4, for creation/repricing. pricedStay is the stay being priced, NOT a later shortened checkout stay (Q-76). */
export function validateReservationPriceSnapshot(
  pricedStay: StayRange,
  lines: readonly ReservationLine[],
  snapshot: ReservationSnapshot | null,
  source: ReservationSource,
): void {
  if (
    !(pricedStay instanceof StayRange) ||
    lines.length < 1 ||
    !RESERVATION_SOURCES.includes(source)
  )
    invalid("snapshot", "Supply a priced stay and its unit lines.");
  const nightCount = pricedStay.nightCount;
  for (const [index, line] of lines.entries()) {
    if (line.nights.length !== nightCount)
      invalid(
        `lines.${index}.nights`,
        "Supply exactly one snapshot per priced night.",
      );
    const seen = new Set<string>();
    for (const entry of line.nights) {
      if (
        !(entry.night instanceof LocalDate) ||
        entry.night.compare(pricedStay.checkIn) < 0 ||
        entry.night.compare(pricedStay.checkOut) >= 0 ||
        seen.has(entry.night.value)
      )
        invalid(
          `lines.${index}.nights`,
          "Night snapshots must uniquely cover the priced stay.",
        );
      seen.add(entry.night.value);
      if (
        source === "EXTERNAL" &&
        snapshot !== null &&
        entry.source !== "MANUAL"
      ) {
        invalid(
          `lines.${index}.nights`,
          "Priced external nights must be reported manual amounts.",
        );
      }
      if (
        snapshot === null
          ? entry.amount !== null || entry.source !== null
          : !(entry.amount instanceof Money) ||
            !["BASE", "PERIOD", "MANUAL"].includes(entry.source ?? "")
      )
        invalid(
          `lines.${index}.nights`,
          "All nights must be priced, or all unpriced for an external reservation.",
        );
    }
    if (snapshot === null) {
      if (source !== "EXTERNAL" || line.subtotal !== null)
        invalid(
          "snapshot",
          "Only an external reservation may be wholly unpriced.",
        );
    } else {
      const sum = line.nights.reduce(
        (total, entry) => total.add(entry.amount!),
        Money.create({ amountMinor: 0, currency: "USD" }),
      );
      if (
        !(line.subtotal instanceof Money) ||
        line.subtotal.amountMinor !== sum.amountMinor
      )
        invalid(
          `lines.${index}.subtotal`,
          "The unit subtotal must equal its nightly amounts.",
        );
    }
  }
  if (snapshot === null) return;
  if (
    source === "EXTERNAL" &&
    (snapshot.serviceLines.length !== 0 || snapshot.couponValue !== null)
  ) {
    invalid(
      "snapshot",
      "External reservations cannot include services or a coupon.",
    );
  }
  for (const service of snapshot.serviceLines) {
    if (
      !z.enum(SERVICE_KINDS).safeParse(service.kind).success ||
      !Number.isSafeInteger(service.priceMinor) ||
      service.priceMinor <= 0 ||
      (service.childPriceMinor !== null &&
        (!Number.isSafeInteger(service.childPriceMinor) ||
          service.childPriceMinor <= 0))
    )
      invalid(
        "services",
        "Supply supported services with valid snapshot prices.",
      );
  }
  const adults = lines.reduce(
      (total, line) => total + line.occupancy.adults,
      0,
    ),
    children = lines.reduce(
      (total, line) => total + line.occupancy.children,
      0,
    );
  const computed = QuoteCalculator.compute({
    // Provenance is deliberately omitted from this arithmetic view. In particular,
    // MANUAL amounts are retained, never re-resolved against current rate tables.
    lines: lines.map((line) => ({
      nights: line.nights.map((entry) => ({
        night: entry.night,
        amount: entry.amount,
        source: null,
        periodId: null,
        label: null,
      })),
    })),
    guests: { adults, children },
    services: snapshot.serviceLines.map((service) => ({
      kind: service.kind,
      vehicles: service.vehicles,
      unit: service.unit,
      price: Money.create({ amountMinor: service.priceMinor, currency: "USD" }),
      childPrice:
        service.childPriceMinor === null
          ? null
          : Money.create({
              amountMinor: service.childPriceMinor,
              currency: "USD",
            }),
    })),
    ...(snapshot.couponValue === null ? {} : { coupon: snapshot.couponValue }),
    vatRateBasisPoints: snapshot.vatRateBasisPoints,
  });
  for (const key of [
    "accommodationMinor",
    "servicesMinor",
    "subtotalMinor",
    "discountMinor",
    "taxableMinor",
    "vatRateBasisPoints",
    "vatMinor",
    "totalMinor",
  ] as const) {
    if (snapshot[key] !== computed[key])
      invalid(key, "The snapshot must match the server quote rules.");
  }
  for (const [index, service] of snapshot.serviceLines.entries()) {
    const expected = computed.serviceLines[index]!;
    // A stored transfer line must name its cars; the recomputation defaults
    // a missing count to one car, so a null count never matches it.
    if (service.vehicles !== expected.vehicles)
      invalid(
        `services.${index}.vehicles`,
        "The stored car count must match the service.",
      );
    for (const key of [
      "adults",
      "children",
      "nights",
      "adultQuantity",
      "childQuantity",
      "amountMinor",
    ] as const) {
      if (service[key] !== expected[key])
        invalid(
          `services.${index}.${key}`,
          "Service quantities and amounts must match their stored unit prices.",
        );
    }
  }
}

/** R-9/10 trusted context is supplied by later transactional use cases, never by request fields. */
export function validateReservationCreation(
  record: ReservationRecord,
  context: Readonly<{
    verifiedBookingPhone: PhoneNumber | null;
    phoneBlocked: boolean;
    inventoryReserved: boolean;
  }>,
): void {
  validateReservationStructure(record);
  const payAtHotel =
    record.status === "CONFIRMED" &&
    record.paymentMethod === "PAY_AT_HOTEL" &&
    record.paymentStatus === "NOT_REQUIRED";
  const onlineHold =
    record.source === "WEBSITE" &&
    record.status === "AWAITING_PAYMENT" &&
    record.paymentMethod === "ONLINE" &&
    record.paymentStatus === "AWAITING" &&
    (record.snapshot?.totalMinor ?? 0) > 0;
  if (!payAtHotel && !onlineHold)
    invalid(
      "status",
      "Creation requires a confirmed pay-at-hotel booking or an online payment hold with a positive total.",
    );
  if (context.inventoryReserved !== true)
    invalid(
      "inventory",
      "Creation requires inventory reserved in the same transaction.",
    );
  if (typeof context.phoneBlocked !== "boolean")
    invalid("phoneBlocked", "Supply the blocked-phone fact.");
  if (
    record.source === "WEBSITE" &&
    (!id.safeParse(record.guestId).success ||
      record.contact.email === null ||
      !(record.contact.phone instanceof PhoneNumber) ||
      !(context.verifiedBookingPhone instanceof PhoneNumber) ||
      !record.contact.phone.equals(context.verifiedBookingPhone) ||
      context.phoneBlocked)
  )
    invalid(
      "guest",
      "Website creation requires a matching verified, unblocked guest with email.",
    );
  validateReservationPriceSnapshot(
    record.stay,
    record.lines,
    record.snapshot,
    record.source,
  );
}
