"use client";

import { useEffect, useRef, useState } from "react";
import { requestQuote } from "@/presentation/api-client/quotes";
import {
  createReservation,
  type BookingInput,
  type BookingCreated,
} from "@/presentation/api-client/reservations";
import { formatMoney } from "@/presentation/format/money";
import {
  alertBox,
  bookingHeading,
  button,
  choiceCard,
  choiceInput,
  eyebrowFlush,
  fieldHelp,
  figures,
  link,
} from "@/presentation/site/classes";
import { clearDraft } from "./booking-draft";
import { keepMatchingResult, saveBookingResult } from "./booking-result";
import { BookingReview, type ReviewTerms } from "./booking-review";
import { couponRefusal, priceAnswered } from "./extras-answer";
import {
  isPriced,
  requestedServices,
  type Extras,
  type OfferedService,
  type Quote,
} from "./extras-state";
import type { BookingSelectionBase } from "./extras-step";
import type { GuestDetails } from "./guest-details";
import { HotelContact, type HotelContactDetails } from "./hotel-contact";
import { replacePage } from "./leave-page";
import { bookingResultsHref } from "./selection-link";
import { waitText, type Verification } from "./verification-state";

type Method = BookingInput["paymentMethod"];
const methodLabel = {
  PAY_AT_HOTEL: "Pay at the hotel",
  ONLINE: "Pay online now",
};
const primary = button(
  "primary",
  "justify-self-start disabled:opacity-60 max-sm:w-full",
);
const action = `${link} justify-self-start`;
const referenceBox =
  "grid min-w-0 gap-1 border-l-2 border-gold-400 bg-canvas px-4 py-3";

type Props = Readonly<{
  selection: BookingSelectionBase;
  guest: GuestDetails & { e164: string };
  verified: NonNullable<Verification["verified"]>;
  terms: ReviewTerms;
  contact: HotelContactDetails;
  extras: Extras;
  services: readonly OfferedService[];
  onChange: (extras: Extras) => void;
  chosen: Method | null;
  choose: (value: Method | null) => void;
  oldPrice: Quote["total"] | null;
  setOldPrice: (value: Quote["total"] | null) => void;
  view: "payment" | "review";
  onView: (view: "payment" | "review") => void;
  onLock: (locked: boolean) => void;
  onPriceStatus: (message: string | null) => void;
  onBack: () => void;
  onVerify: () => void;
  onBlocked: () => void;
}>;

function requestKey() {
  return (
    crypto.randomUUID?.() ??
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("")
  );
}

export function BookingCheckout({
  selection,
  guest,
  verified,
  terms,
  contact,
  extras,
  services,
  onChange,
  chosen,
  choose,
  oldPrice,
  setOldPrice,
  view,
  onView,
  onBack,
  onVerify,
  onBlocked,
  onLock,
  onPriceStatus,
}: Props) {
  const email = verified.channel === "EMAIL";
  const methods = extras.priced.paymentMethods.filter(
    (m) => !email || m === "ONLINE",
  );
  const method =
    methods.length === 1
      ? methods[0]!
      : chosen && methods.includes(chosen)
        ? chosen
        : null;
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [contactOnly, setContactOnly] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [needsQuote, setNeedsQuote] = useState(false);
  const [receipt, setReceipt] = useState<BookingCreated["data"] | null>(null);
  const sending = useRef(false);
  const lastRequest = useRef<{ body: string; key: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const priceAlert = useRef<HTMLDivElement>(null);
  const totalLine = useRef<HTMLParagraphElement>(null);
  const accepted = useRef(false);
  // True while a booking is being sent or its result is unknown. A reload then
  // would lose the request key, so a second try could book twice.
  const unsettled = useRef(false);
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (!unsettled.current) return;
      event.preventDefault();
      event.returnValue = true; // Browsers older than the standard prompt.
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [view, receipt, contactOnly]);
  // The price buttons remove themselves, so focus moves to what replaced them.
  useEffect(() => {
    if (needsQuote) return;
    if (oldPrice) priceAlert.current?.focus();
    else if (accepted.current) {
      accepted.current = false;
      totalLine.current?.focus();
    }
  }, [oldPrice, needsQuote]);
  const offered = services.filter(
    (s) =>
      !extras.withdrawn.includes(s.kind) &&
      !(s.kind === "BREAKFAST" ? extras.breakfast : extras.transfer),
  );
  const quote = extras.priced.quote;

  function back(next: Extras) {
    // The guest is choosing again: an older total is no longer a comparison.
    setOldPrice(null);
    onLock(false);
    onPriceStatus(null);
    onChange(next);
    onBack();
  }
  function lock(active: boolean) {
    sending.current = active;
    setBusy(active);
    onLock(active);
  }
  function stop(message: string) {
    setMessage(message);
    setContactOnly(true);
    onLock(true);
  }
  function unavailable() {
    replacePage(
      bookingResultsHref(
        selection.branchSlug,
        selection.stay,
        selection.lines,
        "unavailable",
      ),
    );
  }

  // A payment choice or price conflict always checks P6. A failed check can
  // only retry the quote; it cannot fall through to a booking submission.
  async function refreshPrice(reason: "payment" | "conflict" | "method") {
    lock(true);
    setMessage("");
    setNeedsQuote(true);
    onPriceStatus("Checking the current price…");
    const input = {
      ...selection,
      services: requestedServices(extras),
      ...(extras.appliedCode ? { couponCode: extras.appliedCode } : {}),
    };
    const result = await requestQuote(input);
    const next = priceAnswered(extras, input, result);
    lock(false);
    if (next.problem?.kind === "unavailable") {
      unavailable();
      return;
    }
    if (next.problem?.kind === "closed") {
      onPriceStatus("Online booking is unavailable.");
      stop("Online booking is unavailable. Please contact the hotel.");
      return;
    }
    if (
      !result.ok &&
      next.appliedCode === extras.appliedCode &&
      next.withdrawn.length === extras.withdrawn.length &&
      next.problem &&
      "message" in next.problem
    ) {
      setMessage(next.problem.message);
      onPriceStatus("The price needs checking.");
      return;
    }
    if (!isPriced(next) || !result.ok) {
      back(next);
      return;
    }
    onChange(next);
    onPriceStatus(null);
    setNeedsQuote(false);
    if (email && !next.priced.paymentMethods.includes("ONLINE")) {
      back(next);
      return;
    }
    // The total the guest last accepted, when the new one differs from it.
    const before =
      oldPrice ??
      (reason === "conflict" ||
      quote.total.amountMinor !== next.priced.quote.total.amountMinor
        ? quote.total
        : null);
    if (before) setOldPrice(before);
    if (
      !method ||
      !next.priced.paymentMethods.includes(method) ||
      reason === "method"
    ) {
      choose(null);
      onView("payment");
      setMessage(
        "The payment options changed. Check the available method before continuing.",
      );
      return;
    }
    onView("review");
    if (before) onLock(true);
  }

  async function submit() {
    if (
      sending.current ||
      !method ||
      !privacy ||
      needsQuote ||
      oldPrice ||
      receipt ||
      contactOnly
    )
      return;
    const input: BookingInput = {
      ...selection,
      services: requestedServices(extras).map((s) =>
        typeof s !== "string" &&
        s.kind === "AIRPORT_TRANSFER" &&
        extras.flightDetails.trim()
          ? { ...s, details: extras.flightDetails.trim() }
          : s,
      ),
      ...(extras.appliedCode ? { couponCode: extras.appliedCode } : {}),
      guest: {
        fullName: guest.fullName,
        email: guest.email,
        phone: guest.e164,
        country: guest.country,
        ...(guest.specialRequests
          ? { specialRequests: guest.specialRequests }
          : {}),
      },
      paymentMethod: method,
      phoneVerificationToken: verified.token,
      expectedTotal: quote.total,
      consent: { privacyNoticeVersion: terms.consentVersions.privacyNotice },
      ...(marketing && !email
        ? {
            marketingOptIn: { consentVersion: terms.consentVersions.marketing },
          }
        : {}),
    };
    const body = JSON.stringify(input);
    if (lastRequest.current?.body !== body)
      lastRequest.current = { body, key: requestKey() };
    lock(true);
    setMessage("");
    unsettled.current = true;
    const result = await createReservation(input, lastRequest.current.key);
    lock(false);
    // Settled before any navigation below, so leaving on success never asks.
    // A rate limit says nothing about an earlier send that had no answer.
    unsettled.current =
      !result.ok && uncertain && result.problem.code === "RATE_LIMITED";
    if (result.ok) {
      const { data } = result;
      onLock(true);
      clearDraft(selection.branchSlug);
      setReceipt(data);
      if (result.status === 200) {
        keepMatchingResult(selection.branchSlug, result.data.reference);
      } else {
        const saved = saveBookingResult(selection.branchSlug, result.data);
        if (result.data.status === "AWAITING_PAYMENT" && saved)
          replacePage(result.data.checkoutUrl);
        else if (saved) replacePage(`/${selection.branchSlug}/book/confirmed`);
      }
      return;
    }
    const problem = result.problem;
    if (uncertain && problem.code === "RATE_LIMITED") onLock(true);
    else setUncertain(false);
    switch (problem.code) {
      case "INVENTORY_UNAVAILABLE":
        unavailable();
        return;
      case "PRICE_CHANGED":
        lastRequest.current = null;
        setOldPrice(quote.total);
        await refreshPrice("conflict");
        return;
      case "PAYMENT_METHOD_UNAVAILABLE":
      case "ONLINE_PAYMENT_REQUIRED":
        await refreshPrice("method");
        return;
      case "COUPON_INVALID":
        back({
          ...extras,
          appliedCode: null,
          trying: null,
          couponDraft: "",
          notice: couponRefusal(problem.context?.reason),
        });
        return;
      case "SERVICE_UNAVAILABLE": {
        const next = priceAnswered(
          extras,
          { ...selection, services: requestedServices(extras) },
          result,
        );
        back({ ...next, priced: { ...next.priced, key: "" } });
        return;
      }
      case "PHONE_NOT_VERIFIED":
        onVerify();
        return;
      case "PHONE_BLOCKED":
        onBlocked();
        return;
      case "BOOKING_LIMIT_REACHED":
        stop("The booking limit has been reached. Please contact the hotel.");
        return;
      case "BRANCH_NOT_BOOKABLE":
      case "NOT_FOUND":
        onPriceStatus("Online booking is unavailable.");
        stop("Online booking is unavailable. Please contact the hotel.");
        return;
      case "RATE_LIMITED":
        setMessage(
          `Too many attempts. Try again in ${waitText((problem.retryAfter ?? 60) * 1000)}.`,
        );
        return;
      case "VALIDATION":
        setMessage(
          Object.values(problem.fieldErrors ?? {})
            .flat()
            .join(" ") ||
            problem.detail ||
            "We couldn’t accept these booking details. Check your entries or contact the hotel.",
        );
        return;
      // PAYMENT_UNAVAILABLE comes only after the booking was saved. Whether
      // its units are still held is unknown here; the retry answers that.
      default:
        unsettled.current = true;
        setUncertain(true);
        onLock(true);
        setMessage(
          problem.code === "PAYMENT_UNAVAILABLE"
            ? "We received your booking, but the secure checkout could not open. Retry this same booking to check it, or contact the hotel."
            : "We couldn’t verify the result. Retry this same booking to check it, or contact the hotel.",
        );
        return;
    }
  }

  if (receipt)
    return (
      <div className="grid gap-4">
        <h2 className={bookingHeading} ref={heading} tabIndex={-1}>
          Your booking reference
        </h2>
        <p className={`${referenceBox} m-0`}>
          <strong className={`${figures} text-heading-md wrap-anywhere`}>
            {receipt.reference}
          </strong>
        </p>
        <p className="m-0">
          Current status: {receipt.status.replaceAll("_", " ").toLowerCase()}.{" "}
          {receipt.status === "PAYMENT_FAILED"
            ? "Payment was not completed and your units are no longer held. Search again or contact the hotel with your reference."
            : "Use your booking message for the private link or contact the hotel with your reference."}
        </p>
        {receipt.status === "PAYMENT_FAILED" && (
          <a
            href={bookingResultsHref(
              selection.branchSlug,
              selection.stay,
              selection.lines,
            )}
            className={primary}
          >
            Search again
          </a>
        )}
        {receipt.status === "AWAITING_PAYMENT" && receipt.checkoutUrl && (
          <a href={receipt.checkoutUrl} className={primary}>
            Continue to payment
          </a>
        )}
        <HotelContact contact={contact} />
      </div>
    );
  if (contactOnly)
    return (
      <div className="grid gap-4">
        <h2 ref={heading} tabIndex={-1} className={bookingHeading}>
          Contact the hotel
        </h2>
        <p role="alert">{message}</p>
        <HotelContact contact={contact} />
      </div>
    );
  const frozen = busy || uncertain || !!oldPrice || needsQuote;
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <p className={eyebrowFlush}>
          Step {view === "payment" ? "4" : "5"} of 5
        </p>
        <h2 ref={heading} tabIndex={-1} className={bookingHeading}>
          {view === "payment" ? "Choose how to pay" : "Review your booking"}
        </h2>
      </div>
      {message && (
        <p role="alert" className={alertBox}>
          {message}
        </p>
      )}
      {view === "payment" ? (
        <>
          <fieldset
            disabled={busy}
            className="m-0 grid min-w-0 gap-3 border-0 p-0"
          >
            <legend className="sr-only">Payment method</legend>
            {methods.map((m) => (
              <label key={m} className={choiceCard}>
                <input
                  className={choiceInput}
                  type="radio"
                  name="method"
                  checked={method === m}
                  onChange={() => {
                    choose(m);
                    setMessage("");
                  }}
                />
                <span className="grid min-w-0">
                  <strong className="font-medium text-plum-900">
                    {methodLabel[m]}
                  </strong>
                  <span className="text-small text-neutral-600">
                    {m === "ONLINE"
                      ? "Pay on the secure checkout page. Your units are held for about 15 minutes."
                      : "Reserve now and pay the hotel during your stay."}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          {methods.length === 1 && (
            <p className="m-0">
              {email
                ? "You verified by email, so this booking requires online payment."
                : method === "ONLINE"
                  ? "Online payment is the only way to pay for this booking."
                  : "Online payment is not available for this booking, so you pay at the hotel."}
            </p>
          )}
          {!method && (
            <p id="payment-hint" className={fieldHelp}>
              Choose a payment method to continue.
            </p>
          )}
          <button
            type="button"
            disabled={!method || busy}
            aria-describedby={method ? undefined : "payment-hint"}
            className={primary}
            onClick={() => void refreshPrice("payment")}
          >
            {busy ? "Checking price…" : "Continue to review"}
          </button>
          <button
            type="button"
            disabled={busy}
            className={action}
            onClick={() => back(extras)}
          >
            Back to extras
          </button>
        </>
      ) : (
        <>
          <BookingReview
            terms={terms}
            paymentLabel={method && methodLabel[method]}
            guest={guest}
            extras={extras}
            offered={offered}
            onAdd={(kind) =>
              back({
                ...extras,
                ...(kind === "BREAKFAST"
                  ? { breakfast: true }
                  : { transfer: true }),
                notice: null,
                problem: null,
              })
            }
            locked={frozen}
            privacy={privacy}
            onPrivacy={setPrivacy}
            marketing={email ? null : marketing}
            onMarketing={setMarketing}
          />
          {needsQuote ? (
            <button
              type="button"
              disabled={busy}
              className={primary}
              onClick={() =>
                void refreshPrice(oldPrice ? "conflict" : "method")
              }
            >
              {busy ? "Checking price…" : "Check price again"}
            </button>
          ) : oldPrice ? (
            <div
              ref={priceAlert}
              tabIndex={-1}
              role="group"
              aria-labelledby="price-changed"
              aria-describedby="price-changed-totals"
              className={`${alertBox} grid gap-3`}
            >
              <p
                id="price-changed"
                className="m-0 font-display text-heading-md text-plum-900"
              >
                Please check the new total
              </p>
              <p id="price-changed-totals" className="m-0">
                The price changed from {formatMoney(oldPrice)} to{" "}
                {formatMoney(quote.total)}. Check the new breakdown before you
                book.
              </p>
              <button
                type="button"
                className={primary}
                onClick={() => {
                  accepted.current = true;
                  setOldPrice(null);
                  lastRequest.current = null;
                  onLock(false);
                }}
              >
                Accept new total
              </button>
              <button
                type="button"
                className={action}
                onClick={() => back(extras)}
              >
                Change extras or coupon
              </button>
            </div>
          ) : (
            <div className="grid gap-3 border-t border-neutral-300 pt-5">
              <p
                ref={totalLine}
                tabIndex={-1}
                className="m-0 flex flex-wrap items-baseline justify-between gap-x-4"
              >
                <span>Total with VAT</span>
                <strong className={`${figures} text-heading-lg`}>
                  {formatMoney(quote.total)}
                </strong>
              </p>
              {!privacy && (
                <p id="privacy-hint" className={fieldHelp}>
                  Accept the privacy notice to continue.
                </p>
              )}
              <button
                type="button"
                disabled={!privacy || busy}
                aria-describedby={privacy ? undefined : "privacy-hint"}
                className={primary}
                onClick={() => void submit()}
              >
                {busy
                  ? "Submitting booking…"
                  : uncertain
                    ? "Retry same booking"
                    : method === "ONLINE"
                      ? "Continue to secure checkout"
                      : "Confirm booking"}
              </button>
            </div>
          )}
          {uncertain && <HotelContact contact={contact} />}
          <button
            type="button"
            disabled={frozen}
            className={action}
            onClick={() => {
              setMessage("");
              onView("payment");
            }}
          >
            Back to payment
          </button>
        </>
      )}
    </div>
  );
}
