import type { z } from "zod";

import type { GuestChangeInput } from "@/contracts/api/v1/guests";

import type { BookingDetail } from "./booking-details";
import { displayDate } from "./display-date";
import { serviceName } from "./extras-answer";
import type { Quote } from "./extras-state";
import {
  CONTROL,
  emailProblem,
  GUEST_INPUT_LIMITS,
  HIDDEN,
  normalizeGuestDetails,
} from "./guest-details";
import { count } from "./price-row";
import { FLIGHT_DETAILS_LIMIT } from "./services-picker";

// The change form of one booking, and what is sent for it (spec 0007, M10-T8b).
// Only the parts the guest changed are sent: the server keeps the rest. No
// price is worked out here.

export const MAX_UNITS = 5;

export type ChangeInput = z.input<typeof GuestChangeInput>;

export type ChangeUnit = Readonly<{
  /** For the screen only. */
  id: number;
  roomSlug: string;
  roomName: string;
  adults: number;
  children: number;
}>;

export type ChangeForm = Readonly<{
  checkIn: string;
  checkOut: string;
  units: readonly ChangeUnit[];
  breakfast: boolean;
  transfer: boolean;
  cars: number;
  flightDetails: string;
  fullName: string;
  email: string;
  specialRequests: string;
}>;

/** A problem to show; `field` is the id of the control it belongs to. */
export type ChangeError = Readonly<{ field: string | null; message: string }>;

export const changeField = {
  checkIn: "change-check-in",
  checkOut: "change-check-out",
  unit: (index: number) => `change-unit-${index}`,
  cars: "transfer-cars",
  flight: "transfer-flight",
  fullName: "change-name",
  email: "change-email",
  specialRequests: "change-requests",
};

/**
 * The form as the booking stands. The server's unchanged preview names each
 * unit's listing; the booking holds the flight details and the contact.
 */
export function prefillChange(
  current: Quote,
  booking: Pick<BookingDetail, "contact" | "price">,
): ChangeForm {
  const transfer = current.services.find(
    ({ kind }) => kind === "AIRPORT_TRANSFER",
  );
  return {
    checkIn: current.stay.checkIn,
    checkOut: current.stay.checkOut,
    units: current.lines.map((line, index) => ({
      id: index + 1,
      roomSlug: line.roomSlug,
      roomName: line.roomName,
      adults: line.occupancy.adults,
      children: line.occupancy.children,
    })),
    breakfast: current.services.some(({ kind }) => kind === "BREAKFAST"),
    transfer: transfer !== undefined,
    cars: transfer?.vehicles ?? 1,
    flightDetails:
      booking.price?.services.find(({ kind }) => kind === "AIRPORT_TRANSFER")
        ?.details ?? "",
    fullName: booking.contact?.fullName ?? "",
    email: booking.contact?.email ?? "",
    specialRequests: booking.contact?.specialRequests ?? "",
  };
}

const contactOf = (form: ChangeForm) =>
  normalizeGuestDetails({
    fullName: form.fullName,
    email: form.email,
    specialRequests: form.specialRequests,
    country: "",
    phone: "",
  });

const unitKeys = (units: readonly ChangeUnit[]) =>
  units
    .map((unit) => `${unit.roomSlug}.${unit.adults}.${unit.children}`)
    .sort()
    .join();

/** Which parts of the booking the form would change. */
export function changedParts(base: ChangeForm, form: ChangeForm) {
  const before = contactOf(base);
  const after = contactOf(form);
  const carsChanged = form.transfer && form.cars !== base.cars;
  const flightChanged =
    form.transfer && form.flightDetails.trim() !== base.flightDetails.trim();
  return {
    dates: form.checkIn !== base.checkIn || form.checkOut !== base.checkOut,
    units: unitKeys(form.units) !== unitKeys(base.units),
    extras:
      form.breakfast !== base.breakfast ||
      form.transfer !== base.transfer ||
      carsChanged ||
      flightChanged,
    fullName: after.fullName !== before.fullName,
    // The server compares addresses without regard to capitals.
    email: after.email.toLowerCase() !== before.email.toLowerCase(),
    specialRequests: after.specialRequests !== before.specialRequests,
  };
}

function servicesOf(base: ChangeForm, form: ChangeForm) {
  const flight = form.flightDetails.trim();
  // A kept transfer sends only what changed, so the server keeps the rest.
  const sendCars = !base.transfer || form.cars !== base.cars;
  const sendFlight = base.transfer
    ? flight !== base.flightDetails.trim()
    : flight !== "";
  return [
    ...(form.breakfast ? ["BREAKFAST" as const] : []),
    ...(form.transfer
      ? [
          {
            kind: "AIRPORT_TRANSFER" as const,
            ...(sendCars ? { vehicles: form.cars } : {}),
            ...(sendFlight ? { details: flight } : {}),
          },
        ]
      : []),
  ];
}

/** The body of a preview or a change; null when nothing differs. */
export function changeInput(
  base: ChangeForm,
  form: ChangeForm,
): ChangeInput | null {
  const parts = changedParts(base, form);
  const contact = contactOf(form);
  const guest = {
    ...(parts.fullName ? { fullName: contact.fullName } : {}),
    ...(parts.email ? { email: contact.email } : {}),
    ...(parts.specialRequests
      ? { specialRequests: contact.specialRequests }
      : {}),
  };
  const input: ChangeInput = {
    ...(parts.dates
      ? { stay: { checkIn: form.checkIn, checkOut: form.checkOut } }
      : {}),
    ...(parts.units
      ? {
          lines: form.units.map(({ roomSlug, adults, children }) => ({
            roomSlug,
            occupancy: { adults, children },
          })),
        }
      : {}),
    ...(parts.extras ? { services: servicesOf(base, form) } : {}),
    ...(Object.keys(guest).length > 0 ? { guest } : {}),
  };
  return Object.keys(input).length > 0 ? input : null;
}

/**
 * What the browser can refuse before asking. Only changed values are checked,
 * so an older booking can still change something else. The server decides.
 */
export function checkChange(base: ChangeForm, form: ChangeForm): ChangeError[] {
  const parts = changedParts(base, form);
  const contact = contactOf(form);
  const errors: ChangeError[] = [];
  const refuse = (field: string, message: string) =>
    errors.push({ field, message });
  const text = (field: string, value: string, limit: number) => {
    if (CONTROL.test(value)) refuse(field, HIDDEN);
    else if (value.length > limit)
      refuse(field, `Use ${limit} characters or fewer.`);
  };

  if (parts.dates) {
    if (!form.checkIn) refuse(changeField.checkIn, "Choose a check-in date.");
    if (!form.checkOut)
      refuse(changeField.checkOut, "Choose a check-out date.");
    else if (form.checkIn && form.checkOut <= form.checkIn)
      refuse(changeField.checkOut, "Choose a check-out after the check-in.");
  }
  if (parts.extras && form.transfer)
    text(changeField.flight, form.flightDetails.trim(), FLIGHT_DETAILS_LIMIT);
  if (parts.fullName) {
    if (!contact.fullName)
      refuse(changeField.fullName, "Enter your full name.");
    else
      text(changeField.fullName, contact.fullName, GUEST_INPUT_LIMITS.fullName);
  }
  if (parts.email) {
    const wrong = emailProblem(contact.email);
    if (wrong) refuse(changeField.email, wrong);
  }
  if (parts.specialRequests)
    text(
      changeField.specialRequests,
      contact.specialRequests,
      GUEST_INPUT_LIMITS.specialRequests,
    );
  return errors;
}

function unitsText(units: readonly ChangeUnit[]) {
  return units
    .map(
      (unit) =>
        `${unit.roomName} (${count(unit.adults, "adult", "adults")}, ${count(unit.children, "child", "children")})`,
    )
    .join("; ");
}

function extrasText(form: ChangeForm) {
  const flight = form.flightDetails.trim();
  return [
    ...(form.breakfast ? [serviceName.BREAKFAST] : []),
    ...(form.transfer
      ? [
          `${serviceName.AIRPORT_TRANSFER}, ${count(form.cars, "car", "cars")}${flight ? `, ${flight}` : ""}`,
        ]
      : []),
  ].join("; ");
}

export type ChangeFact = Readonly<{
  label: string;
  before: string;
  after: string;
}>;

/** What the review lists: each changed part, as it was and as it would be. */
export function changeFacts(base: ChangeForm, form: ChangeForm): ChangeFact[] {
  const parts = changedParts(base, form);
  const before = contactOf(base);
  const after = contactOf(form);
  const day = (value: string) => displayDate({ value });
  const dates = ({ checkIn, checkOut }: ChangeForm) =>
    `${day(checkIn)} to ${day(checkOut)}`;
  const rows: [boolean, string, string, string][] = [
    [parts.dates, "Dates", dates(base), parts.dates ? dates(form) : ""],
    [
      parts.units,
      "Rooms and guests",
      unitsText(base.units),
      unitsText(form.units),
    ],
    [parts.extras, "Extras", extrasText(base), extrasText(form)],
    [parts.fullName, "Name", before.fullName, after.fullName],
    [parts.email, "Email", before.email, after.email],
    [
      parts.specialRequests,
      "Special requests",
      before.specialRequests,
      after.specialRequests,
    ],
  ];
  return rows
    .filter(([changed]) => changed)
    .map(([, label, old, next]) => ({
      label,
      before: old || "None",
      after: next || "None",
    }));
}
