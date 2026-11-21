import { parseGuestContact } from "@/domain/guests";
import type { ResolvedNightPrice } from "@/domain/pricing";
import { serviceInputSchema } from "@/domain/services";
import {
  DomainValidationError,
  issuesFromZod,
} from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { Money } from "@/domain/shared/money";
import { Occupancy } from "@/domain/shared/occupancy";
import { StayRange } from "@/domain/shared/stay-range";

// Operational limit for S3 and S4. Public stay policy is applied separately.
const MAX_STAFF_STAY_NIGHTS = 366;

type Amounts = Readonly<{
  nights: readonly Readonly<{ night: string; amountMinor: number }>[];
}>;
type CommonInput = Readonly<{
  branchId: string;
  stay: { checkIn: string; checkOut: string };
  lines: readonly {
    roomTypeId: string;
    occupancy: { adults: number; children: number };
  }[];
  guest: {
    fullName: string;
    phone: string;
    email?: string | undefined;
    country?: string | undefined;
    specialRequests?: string | undefined;
  };
  notes?: string | undefined;
}>;
export type StaffReservationInput = CommonInput &
  Readonly<{
    services?: readonly unknown[] | undefined;
    couponCode?: string | undefined;
    priceOverride?: { lines: readonly Amounts[]; reason: string } | undefined;
    sendConfirmation: boolean;
  }>;
export type ExternalReservationInput = Omit<CommonInput, "lines"> &
  Readonly<{
    externalReference: string;
    channel?: string | undefined;
    lines: readonly (CommonInput["lines"][number] & {
      amounts?: Amounts | undefined;
    })[];
  }>;

type StaffBookingRequest =
  | { source: "STAFF"; body: StaffReservationInput }
  | { source: "EXTERNAL"; body: ExternalReservationInput };
export type { StaffBookingRequest };

function invalidField(path: string, message: string): never {
  throw new DomainValidationError("Check the reservation details.", [
    { path, message },
  ]);
}

function freeText(value: string | undefined, path: string, maximum: number) {
  if (value === undefined) return null;
  if (value.length > maximum || /[\p{Cc}\p{Cf}]/u.test(value))
    invalidField(path, "Use bounded plain text without control characters.");
  return value.trim() || null;
}

function manualNights(
  stay: StayRange,
  amounts: readonly (Amounts | undefined)[],
  path: string,
): readonly (readonly ResolvedNightPrice<"MANUAL">[])[] {
  return amounts.map((line, index) => {
    const field = `${path}.${index}`;
    if (!line || line.nights.length !== stay.nightCount)
      invalidField(field, "Provide an amount for every night of this unit.");
    const byDate = new Map(
      line.nights.map((night) => [night.night, night.amountMinor]),
    );
    return [...stay.nights()].map((night) => {
      const amountMinor = byDate.get(night.value);
      if (amountMinor === undefined || amountMinor > 2_147_483_647)
        invalidField(field, "Provide one valid amount per stay night.");
      return {
        night,
        amount: Money.create({ amountMinor, currency: "USD" }),
        source: "MANUAL",
        periodId: null,
        label: null,
      };
    });
  });
}

export function parseStaffBooking(input: StaffBookingRequest) {
  const { body } = input;
  const { guest } = body;
  const stay = StayRange.create(
    LocalDate.parse(body.stay.checkIn),
    LocalDate.parse(body.stay.checkOut),
  );
  if (stay.nightCount > MAX_STAFF_STAY_NIGHTS)
    invalidField(
      "stay.checkOut",
      `Use a stay of at most ${MAX_STAFF_STAY_NIGHTS} nights.`,
    );
  if (body.lines.length < 1 || body.lines.length > 5)
    invalidField("lines", "Choose one to five units.");
  const lines = body.lines.map((line) => ({
    roomTypeId: line.roomTypeId,
    occupancy: Occupancy.create(line.occupancy),
  }));
  const contact = parseGuestContact(guest);
  if (!contact.phone) invalidField("guest.phone", "Enter a phone number.");
  const common = {
    branchId: body.branchId,
    stay,
    lines,
    contact: { ...contact, phone: contact.phone },
    notes: freeText(body.notes, "notes", 2000),
  };
  if (input.source === "EXTERNAL") {
    const { body } = input;
    const externalReference = freeText(
      body.externalReference,
      "externalReference",
      80,
    );
    if (!externalReference)
      invalidField("externalReference", "Enter an external reference.");
    if (!contact.email) invalidField("guest.email", "Enter an email address.");
    const amounts = body.lines.map((line) => line.amounts);
    return {
      ...common,
      source: input.source,
      externalReference,
      externalChannel: freeText(body.channel, "channel", 80),
      manualAmounts: amounts.some(Boolean)
        ? manualNights(stay, amounts, "lines")
        : null,
      overrideReason: null,
      services: [],
      couponCode: undefined,
      sendConfirmation: false,
    } as const;
  }
  const {
    priceOverride,
    couponCode,
    sendConfirmation,
    services = [],
  } = input.body;
  const overrideReason = freeText(
    priceOverride?.reason,
    "priceOverride.reason",
    500,
  );
  if (
    priceOverride &&
    (!overrideReason || priceOverride.lines.length !== lines.length)
  )
    invalidField(
      "priceOverride",
      "Supply a reason and nightly prices for every unit.",
    );
  return {
    ...common,
    source: input.source,
    externalReference: null,
    externalChannel: null,
    manualAmounts: priceOverride
      ? manualNights(stay, priceOverride.lines, "priceOverride.lines")
      : null,
    overrideReason,
    couponCode,
    sendConfirmation,
    services: services.map((service, index) => {
      const parsed = serviceInputSchema.safeParse(service);
      if (!parsed.success)
        throw new DomainValidationError(
          "Check the services.",
          issuesFromZod(parsed.error.issues).map((issue) => ({
            ...issue,
            path: ["services", index, issue.path]
              .filter((segment) => segment !== "")
              .join("."),
          })),
        );
      return parsed.data;
    }),
  } as const;
}

export type StaffBooking = ReturnType<typeof parseStaffBooking>;
