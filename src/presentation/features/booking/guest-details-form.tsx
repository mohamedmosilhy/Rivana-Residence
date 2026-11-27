"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  alertBox,
  bookingHeading,
  button,
  eyebrowFlush,
  fieldControl,
  fieldError,
  fieldGroup,
  fieldHelp,
  fieldLabel,
  selectArrow,
} from "@/presentation/site/classes";

import {
  checkGuestDetails,
  GUEST_INPUT_LIMITS,
  normalizeGuestDetails,
  type GuestDetails,
  type GuestDetailsErrors,
  type GuestDetailsField,
} from "./guest-details";
import { loadPhoneLibrary, toInternationalPhone } from "./international-phone";

export type PhoneCountry = Readonly<{ code: string; label: string }>;

const fieldNames: Record<GuestDetailsField, string> = {
  fullName: "Full name",
  email: "Email",
  country: "Phone country",
  phone: "Phone number",
  specialRequests: "Special requests",
};
const order: readonly GuestDetailsField[] = [
  "fullName",
  "email",
  "country",
  "phone",
  "specialRequests",
];
const fieldId = (field: GuestDetailsField) => `guest-${field}`;

/**
 * Step 1: who is staying. Continue checks the values and turns the phone into
 * its international form; nothing is sent to the server here.
 */
export function GuestDetailsForm({
  value,
  countries,
  errors,
  focusHeading,
  onChange,
  onErrors,
  onContinue,
}: Readonly<{
  value: GuestDetails;
  countries: readonly PhoneCountry[];
  /** Includes what the server refused when a code was asked for. */
  errors: GuestDetailsErrors;
  /** Set when the guest comes back to this step. */
  focusHeading: boolean;
  onChange: (value: GuestDetails) => void;
  onErrors: (errors: GuestDetailsErrors) => void;
  /** Normalized details and the E.164 phone. */
  onContinue: (details: GuestDetails, phone: string) => void;
}>) {
  const [checking, setChecking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const busy = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const invalid = order.filter((field) => errors[field]);
  // Errors that arrive with the step (from the server) are announced too.
  const arrivedWithErrors = useRef(invalid.length > 0);

  useEffect(() => {
    if (arrivedWithErrors.current) summary.current?.focus();
    else if (focusHeading) heading.current?.focus();
  }, [focusHeading]);

  useEffect(() => {
    if (attempt > 0) summary.current?.focus();
  }, [attempt]);

  function change(field: GuestDetailsField, next: string) {
    onChange({ ...value, [field]: next });
    if (errors[field]) {
      const rest = { ...errors };
      delete rest[field];
      onErrors(rest);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    const details = normalizeGuestDetails(value);
    const found = checkGuestDetails(details);
    let phone = "";
    if (!found.phone) {
      const result = await toInternationalPhone(details.phone, details.country);
      if (result.ok) phone = result.phone;
      else
        found.phone =
          result.reason === "INVALID"
            ? "Enter a valid number for the chosen country, or start with + and the country code."
            : "We couldn’t check the phone number. Check your connection, then try again.";
    }
    busy.current = false;
    setChecking(false);
    onErrors(found);
    if (Object.keys(found).length > 0) setAttempt((count) => count + 1);
    else onContinue(details, phone);
  }

  const describe = (field: GuestDetailsField, help?: string) => ({
    id: fieldId(field),
    name: field,
    value: value[field],
    readOnly: checking,
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby":
      [help, errors[field] && `${fieldId(field)}-error`]
        .filter(Boolean)
        .join(" ") || undefined,
  });
  const message = (field: GuestDetailsField) =>
    errors[field] ? (
      <p id={`${fieldId(field)}-error`} className={fieldError}>
        {errors[field]}
      </p>
    ) : null;

  return (
    <form noValidate onSubmit={submit} className="grid gap-5">
      <div className="grid gap-2">
        <p className={eyebrowFlush}>Step 1 of 5</p>
        <h2 ref={heading} tabIndex={-1} className={bookingHeading}>
          Your details
        </h2>
        <p className={fieldHelp}>All fields are required unless marked.</p>
      </div>
      {invalid.length > 0 && (
        <div ref={summary} tabIndex={-1} role="alert" className={alertBox}>
          <p className="m-0 font-medium text-danger">Check your details</p>
          <ul className="m-0 list-none p-0">
            {invalid.map((field) => (
              <li key={field}>
                <a
                  className="inline-flex min-h-11 items-center underline"
                  href={`#${fieldId(field)}`}
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById(fieldId(field))?.focus();
                  }}
                >
                  {fieldNames[field]}: {errors[field]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={fieldGroup}>
        <label htmlFor={fieldId("fullName")} className={fieldLabel}>
          {fieldNames.fullName}
        </label>
        <input
          {...describe("fullName")}
          type="text"
          autoComplete="name"
          required
          maxLength={GUEST_INPUT_LIMITS.fullName}
          className={fieldControl}
          onChange={(event) => change("fullName", event.currentTarget.value)}
        />
        {message("fullName")}
      </div>
      <div className={fieldGroup}>
        <label htmlFor={fieldId("email")} className={fieldLabel}>
          {fieldNames.email}
        </label>
        <input
          {...describe("email")}
          type="email"
          autoComplete="email"
          required
          maxLength={GUEST_INPUT_LIMITS.email}
          className={fieldControl}
          onChange={(event) => change("email", event.currentTarget.value)}
        />
        {message("email")}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={fieldGroup}>
          <label htmlFor={fieldId("country")} className={fieldLabel}>
            {fieldNames.country}
          </label>
          {/* Safari ignores the height of a native list, so it is restyled. */}
          <span className="relative min-w-0">
            <select
              id={fieldId("country")}
              name="country"
              autoComplete="country"
              value={value.country}
              disabled={checking}
              className={`${fieldControl} h-13 appearance-none pr-9`}
              onChange={(event) => change("country", event.currentTarget.value)}
            >
              {countries.map(({ code, label }) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
            <span aria-hidden="true" className={selectArrow} />
          </span>
        </div>
        <div className={fieldGroup}>
          <label htmlFor={fieldId("phone")} className={fieldLabel}>
            {fieldNames.phone}
          </label>
          <input
            {...describe("phone")}
            type="tel"
            autoComplete="tel-national"
            required
            maxLength={GUEST_INPUT_LIMITS.phone}
            className={fieldControl}
            onFocus={() => void loadPhoneLibrary().catch(() => {})}
            onChange={(event) => change("phone", event.currentTarget.value)}
          />
          {message("phone")}
        </div>
      </div>
      <div className={fieldGroup}>
        <label htmlFor={fieldId("specialRequests")} className={fieldLabel}>
          {fieldNames.specialRequests}{" "}
          <span className="font-normal text-neutral-600">(optional)</span>
        </label>
        <textarea
          {...describe("specialRequests")}
          rows={3}
          maxLength={GUEST_INPUT_LIMITS.specialRequests}
          className={`${fieldControl} py-3`}
          onChange={(event) =>
            change("specialRequests", event.currentTarget.value)
          }
        />
        {message("specialRequests")}
      </div>
      <button
        type="submit"
        disabled={checking}
        className={button("primary", "justify-self-start max-sm:w-full")}
      >
        {checking ? "Checking…" : "Continue to verification"}
      </button>
    </form>
  );
}
