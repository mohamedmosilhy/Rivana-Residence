"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  alertBox,
  bookingHeading,
  button,
  choiceCard,
  choiceInput,
  eyebrowFlush,
  fieldControl,
  fieldError,
  fieldGroup,
  fieldHelp,
  fieldLabel,
  selectArrow,
} from "@/presentation/site/classes";

import { emailProblem, GUEST_INPUT_LIMITS } from "./guest-details";
import type { PhoneCountry } from "./guest-details-form";
import { loadPhoneLibrary, toInternationalPhone } from "./international-phone";
import type { VerificationChannel } from "./verification-state";

export type FindValues = Readonly<{
  channel: VerificationChannel;
  country: string;
  /** As typed. */
  phone: string;
  email: string;
}>;
export type FindErrors = Readonly<{ phone?: string; email?: string }>;

const channelChoice: Record<VerificationChannel, [string, string]> = {
  WHATSAPP: [
    "WhatsApp",
    "Shows bookings made with your phone number, except those verified by email.",
  ],
  EMAIL: ["Email", "Shows bookings that use your email address."],
};

/** Step 1 of "My reservations": where to send the code. */
export function FindReservationsForm({
  channels,
  countries,
  value,
  errors,
  notice,
  takeFocus,
  onChange,
  onErrors,
  onContinue,
}: Readonly<{
  /** The channels that can send a code now. At least one. */
  channels: readonly VerificationChannel[];
  countries: readonly PhoneCountry[];
  value: FindValues;
  errors: FindErrors;
  /** Why the guest is back here. */
  notice: string | null;
  /** True after another screen; the first visit keeps the page's focus. */
  takeFocus: boolean;
  onChange: (value: FindValues) => void;
  onErrors: (errors: FindErrors) => void;
  /** With the E.164 phone and the trimmed email. */
  onContinue: (phone: string, email: string) => void;
}>) {
  const [checking, setChecking] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const channel = channels.includes(value.channel)
    ? value.channel
    : channels[0]!;
  const byEmail = channel === "EMAIL";

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Decided once, so a later change on this screen never moves the focus.
  const focusHeading = useRef(takeFocus && !errors.phone && !errors.email);
  useEffect(() => {
    if (focusHeading.current) heading.current?.focus();
  }, []);

  // The first field that needs a change, whether found here or by the server.
  useEffect(() => {
    if (errors.phone) phoneInput.current?.focus();
    else if (errors.email) emailInput.current?.focus();
  }, [errors]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (checking) return;
    const typed = value.phone.trim();
    const email = byEmail ? value.email.trim() : "";
    const found: { phone?: string; email?: string } = {};
    const wrongEmail = byEmail ? emailProblem(email) : null;
    if (wrongEmail) found.email = wrongEmail;
    let phone = "";
    if (!typed) found.phone = "Enter your phone number.";
    else {
      setChecking(true);
      const result = await toInternationalPhone(typed, value.country);
      if (!mounted.current) return;
      setChecking(false);
      if (result.ok) phone = result.phone;
      else
        found.phone =
          result.reason === "INVALID"
            ? "Enter a valid number for the chosen country, or start with + and the country code."
            : "We couldn’t check the phone number. Check your connection, then try again.";
    }
    onErrors(found);
    if (!found.phone && !found.email) onContinue(phone, email);
  }

  const described = (name: "phone" | "email", help?: string) =>
    [errors[name] ? `find-${name}-error` : null, help]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <form noValidate onSubmit={submit} className="grid gap-5">
      <div className="grid gap-2">
        <p className={eyebrowFlush}>Step 1 of 2</p>
        <h2 ref={heading} tabIndex={-1} className={bookingHeading}>
          Find your bookings
        </h2>
        <p className={fieldHelp}>
          We send a 6 digit code to prove the bookings are yours.
        </p>
      </div>
      {notice && (
        <div role="status" className={alertBox}>
          <p className="m-0">{notice}</p>
        </div>
      )}
      {channels.length > 1 && (
        <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
          <legend className={`${fieldLabel} mb-2 p-0`}>
            How do you want to get your code?
          </legend>
          {channels.map((option) => (
            <label key={option} className={choiceCard}>
              <input
                type="radio"
                name="find-channel"
                value={option}
                checked={channel === option}
                disabled={checking}
                className={choiceInput}
                onChange={() => {
                  onErrors({});
                  onChange({ ...value, channel: option });
                }}
              />
              <span className="grid min-w-0">
                <span className="font-medium">{channelChoice[option][0]}</span>
                <span className="text-small text-neutral-600">
                  {channelChoice[option][1]}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {byEmail && (
        <div className={fieldGroup}>
          <label htmlFor="find-email" className={fieldLabel}>
            Email
          </label>
          <input
            ref={emailInput}
            id="find-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={GUEST_INPUT_LIMITS.email}
            value={value.email}
            readOnly={checking}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={described("email")}
            className={fieldControl}
            onChange={(event) =>
              onChange({ ...value, email: event.currentTarget.value })
            }
          />
          {errors.email && (
            <p id="find-email-error" className={fieldError}>
              {errors.email}
            </p>
          )}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={fieldGroup}>
          <label htmlFor="find-country" className={fieldLabel}>
            Phone country
          </label>
          {/* Safari ignores the height of a native list, so it is restyled. */}
          <span className="relative min-w-0">
            <select
              id="find-country"
              name="country"
              autoComplete="country"
              value={value.country}
              disabled={checking}
              className={`${fieldControl} h-13 appearance-none pr-9`}
              onChange={(event) =>
                onChange({ ...value, country: event.currentTarget.value })
              }
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
          <label htmlFor="find-phone" className={fieldLabel}>
            Phone number
          </label>
          <input
            ref={phoneInput}
            id="find-phone"
            name="phone"
            type="tel"
            autoComplete="tel-national"
            required
            maxLength={GUEST_INPUT_LIMITS.phone}
            value={value.phone}
            readOnly={checking}
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby={described(
              "phone",
              byEmail ? "find-phone-help" : undefined,
            )}
            className={fieldControl}
            onFocus={() => void loadPhoneLibrary().catch(() => {})}
            onChange={(event) =>
              onChange({ ...value, phone: event.currentTarget.value })
            }
          />
          {errors.phone && (
            <p id="find-phone-error" className={fieldError}>
              {errors.phone}
            </p>
          )}
        </div>
      </div>
      {byEmail && (
        <p id="find-phone-help" className={fieldHelp}>
          Your phone number is needed too. With an email code, bookings are
          found by your email address only.
        </p>
      )}
      <button
        type="submit"
        disabled={checking}
        className={button("primary", "justify-self-start max-sm:w-full")}
      >
        {checking ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}
