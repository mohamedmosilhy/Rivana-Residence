"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatMoney } from "@/presentation/format/money";
import {
  alertBox,
  bookingHeading,
  button,
  eyebrowFlush,
  link,
} from "@/presentation/site/classes";

import { CouponField } from "./coupon-field";
import { priceAnswered } from "./extras-answer";
import {
  isPriced,
  requestedServices,
  sentCode,
  type Extras,
  type OfferedService,
} from "./extras-state";
import { CONTROL, HIDDEN } from "./guest-details";
import { HotelContact, type HotelContactDetails } from "./hotel-contact";
import {
  bookingResultsHref,
  type SelectionLine,
  type SelectionStay,
} from "./selection-link";
import { useDebouncedQuote } from "./selection-quote";
import { FLIGHT_DETAILS_LIMIT, ServicesPicker } from "./services-picker";

/** What is being booked, as the details page read it from its address. */
export type BookingSelectionBase = Readonly<{
  branchSlug: string;
  stay: SelectionStay;
  lines: SelectionLine[];
}>;

/**
 * Step 3: extras and a coupon. Every change asks the server for a new price
 * (API-P6); Continue waits until the price answers what is chosen.
 */
export function ExtrasStep({
  selection,
  services,
  maxVehicles,
  value,
  emailVerified,
  contact,
  onChange,
  onBack,
  onEdit,
  onContinue,
}: Readonly<{
  selection: BookingSelectionBase;
  services: readonly OfferedService[];
  maxVehicles: number | null;
  value: Extras;
  /** An email booking must be paid online (Q-100). */
  emailVerified: boolean;
  contact: HotelContactDetails;
  onChange: (update: (current: Extras) => Extras) => void;
  onBack: () => void;
  onEdit: () => void;
  onContinue: () => void;
}>) {
  const { branchSlug, stay, lines } = selection;
  const { breakfast, transfer, cars, problem, priced } = value;
  const code = sentCode(value);
  const current = isPriced(value);
  const wanted = !current && problem === null;
  const request = useMemo(
    () =>
      wanted
        ? {
            branchSlug,
            stay,
            lines,
            services: requestedServices({ breakfast, transfer, cars }),
            ...(code === null ? {} : { couponCode: code }),
          }
        : null,
    [wanted, branchSlug, stay, lines, breakfast, transfer, cars, code],
  );
  useDebouncedQuote(request, (result, sent) =>
    onChange((held) => priceAnswered(held, sent, result)),
  );

  const [flightError, setFlightError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const couponInput = useRef<HTMLInputElement>(null);
  useEffect(() => heading.current?.focus(), []);
  // A withdrawn service takes its checkbox, and perhaps the focus, with it.
  useEffect(() => {
    if (document.activeElement === document.body) heading.current?.focus();
  }, [value.withdrawn]);

  const unpayable = emailVerified && !priced.paymentMethods.includes("ONLINE");
  const ready = current && !unpayable;
  const offered = services.filter(
    ({ kind }) =>
      !value.withdrawn.includes(kind) &&
      (kind !== "AIRPORT_TRANSFER" || maxVehicles !== null),
  );

  /** A choice that changes the price starts a new check. */
  function choose(patch: Partial<Extras>) {
    onChange((held) => ({ ...held, ...patch, problem: null, notice: null }));
  }

  function applyCoupon() {
    if (value.trying !== null && problem === null) return;
    const typed = value.couponDraft.trim();
    if (!typed) {
      onChange((held) => ({ ...held, couponError: "Enter a coupon code." }));
      couponInput.current?.focus();
      return;
    }
    if (typed.toUpperCase() === value.appliedCode) {
      onChange((held) => ({ ...held, couponDraft: "", couponError: null }));
      return;
    }
    // Sending a refused code again would only use up the coupon limit.
    const { refused } = value;
    if (refused?.code === typed.toUpperCase()) {
      onChange((held) => ({ ...held, couponError: refused.reason }));
      couponInput.current?.focus();
      return;
    }
    choose({ trying: typed, couponError: null });
  }

  function removeCoupon() {
    choose({
      appliedCode: null,
      trying: null,
      couponDraft: "",
      couponError: null,
    });
    couponInput.current?.focus();
  }

  function proceed() {
    if (!ready) return;
    if (value.couponDraft.trim()) {
      onChange((held) => ({
        ...held,
        couponError: "Apply the code or clear it.",
      }));
      couponInput.current?.focus();
      return;
    }
    if (transfer) {
      const details = value.flightDetails.trim();
      const refused = CONTROL.test(details)
        ? HIDDEN
        : details.length > FLIGHT_DETAILS_LIMIT
          ? `Use ${FLIGHT_DETAILS_LIMIT} characters or fewer.`
          : null;
      setFlightError(refused);
      if (refused) {
        document.getElementById("transfer-flight")?.focus();
        return;
      }
    }
    onContinue();
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <p className={eyebrowFlush}>Step 3 of 5</p>
        <h2 ref={heading} tabIndex={-1} className={bookingHeading}>
          Extras and coupon
        </h2>
      </div>

      <div role="status">
        {value.notice && <p className={`${alertBox} m-0`}>{value.notice}</p>}
      </div>

      <ServicesPicker
        services={offered}
        maxVehicles={maxVehicles}
        breakfast={breakfast}
        transfer={transfer}
        cars={cars}
        flightDetails={value.flightDetails}
        carsError={problem?.kind === "cars" ? problem.message : null}
        flightError={flightError}
        onToggle={(kind, chosen) =>
          choose(
            kind === "BREAKFAST" ? { breakfast: chosen } : { transfer: chosen },
          )
        }
        onCars={(next) => choose({ cars: next })}
        onFlightDetails={(next) => {
          setFlightError(null);
          onChange((held) => ({ ...held, flightDetails: next }));
        }}
      />

      <CouponField
        inputRef={couponInput}
        value={value.couponDraft}
        applied={value.appliedCode}
        checking={value.trying !== null && problem === null}
        error={value.couponError}
        onChange={(next) =>
          onChange((held) => ({
            ...held,
            couponDraft: next,
            couponError: null,
            refused: null,
            // A code still unanswered is replaced by the new typing.
            ...(held.trying === null ? {} : { trying: null, problem: null }),
          }))
        }
        onApply={applyCoupon}
        onRemove={removeCoupon}
      />

      {problem && problem.kind !== "cars" && (
        <div role="alert" className={`${alertBox} grid gap-2`}>
          {problem.kind === "unavailable" || problem.kind === "selection" ? (
            <>
              <p className="m-0">
                {problem.kind === "unavailable"
                  ? "Your selection is no longer available."
                  : "We can no longer price this selection."}
              </p>
              <Link
                href={
                  bookingResultsHref(
                    branchSlug,
                    stay,
                    lines,
                    problem.kind,
                  ) as Route
                }
                prefetch={false}
                className={`${link} justify-self-start`}
              >
                Back to the results
              </Link>
            </>
          ) : "message" in problem ? (
            <>
              <p className="m-0">{problem.message}</p>
              <div className="flex flex-wrap items-center gap-x-7">
                <button
                  type="button"
                  className={link}
                  onClick={() => {
                    heading.current?.focus();
                    onChange((held) => ({ ...held, problem: null }));
                  }}
                >
                  Check again
                </button>
                {problem.kind === "rate" && code !== null && (
                  <button type="button" className={link} onClick={removeCoupon}>
                    Remove coupon
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="m-0">
                Online booking is unavailable. Please contact the hotel.
              </p>
              <HotelContact contact={contact} />
            </>
          )}
        </div>
      )}

      <div role="status" className="text-neutral-800">
        {current ? (
          <p className="m-0">
            Total with VAT:{" "}
            <strong className="font-medium text-plum-900 tabular-nums">
              {formatMoney(priced.quote.total)}
            </strong>
          </p>
        ) : (
          problem === null && <p className="m-0">Updating price…</p>
        )}
      </div>
      {current && unpayable && (
        <div
          id="extras-unpayable"
          role="alert"
          className={`${alertBox} grid gap-2`}
        >
          <p className="m-0 text-danger">
            You verified by email, so this booking is paid online, and this
            total cannot be paid online.{" "}
            {value.appliedCode
              ? "Remove the coupon or contact the hotel."
              : "Contact the hotel."}
          </p>
          <HotelContact contact={contact} />
        </div>
      )}
      <button
        type="button"
        aria-disabled={ready ? undefined : true}
        aria-describedby={current && unpayable ? "extras-unpayable" : undefined}
        className={button(
          "primary",
          "justify-self-start aria-disabled:opacity-70 max-sm:w-full",
        )}
        onClick={proceed}
      >
        Continue to payment
      </button>
      <div className="flex flex-wrap items-center gap-x-7">
        <button type="button" className={link} onClick={onBack}>
          Back to verification
        </button>
        <button type="button" className={link} onClick={onEdit}>
          Edit your details
        </button>
      </div>
    </div>
  );
}
