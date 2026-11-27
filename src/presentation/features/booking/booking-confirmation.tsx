"use client";

import { useEffect, useState } from "react";
import { getGuestReservation } from "@/presentation/api-client/guest";
import { formatMoney } from "@/presentation/format/money";
import {
  bookingBlock,
  bookingHeading,
  bookingPanel,
  bookingSubheading,
  eyebrowFlush,
  factList,
  factTerm,
  factValue,
  figures,
  link,
} from "@/presentation/site/classes";
import { Icon } from "@/presentation/site/icons";
import { readBookingResult } from "./booking-result";
import { HotelContact, type HotelContactDetails } from "./hotel-contact";
import { serviceName } from "./extras-answer";
import { count, PriceRow, vatLabel } from "./price-row";
import { StayDates, type StayTimes } from "./stay-dates";

type Detail = Extract<
  Awaited<ReturnType<typeof getGuestReservation>>,
  { ok: true }
>["data"];
type Answer = Detail | "missing" | "retry" | null;

export function BookingConfirmation({
  contact,
  times,
}: {
  contact: HotelContactDetails;
  times: StayTimes;
}) {
  const [answer, setAnswer] = useState<Answer>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function read() {
      const saved = readBookingResult(contact.slug);
      if (!saved) {
        setAnswer("missing");
        return;
      }
      const result = await getGuestReservation(
        { kind: "MANAGE_LINK", token: saved.token },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setAnswer(
          result.problem.status === 401 || result.problem.status === 404
            ? "missing"
            : "retry",
        );
      } else {
        setAnswer(
          result.data.branch.slug === contact.slug &&
            result.data.reference === saved.reference
            ? result.data
            : "missing",
        );
      }
    }
    void read();
    return () => controller.abort();
  }, [contact.slug, attempt]);

  const booking = typeof answer === "object" ? answer : null;
  return (
    <section
      className={`${bookingPanel} mx-auto grid w-full max-w-3xl min-w-0 content-start gap-5`}
    >
      {/* One short announcement, not the whole of the details. */}
      <p role="status" className={answer === null ? "m-0" : "visually-hidden"}>
        {answer === null
          ? "Checking your booking…"
          : booking
            ? "Booking details loaded."
            : "Booking details are not shown."}
      </p>
      {answer === "retry" && (
        <>
          <h2 className={bookingHeading}>We couldn’t check the booking</h2>
          <p className="m-0">Check your connection, then try again.</p>
          <button
            type="button"
            className={`${link} justify-self-start`}
            onClick={() => {
              setAnswer(null);
              setAttempt((n) => n + 1);
            }}
          >
            Check again
          </button>
        </>
      )}
      {answer === "missing" && (
        <h2 className={bookingHeading}>Open your booking message</h2>
      )}
      {booking && <BookingDetails booking={booking} times={times} />}
      {answer !== null && (
        <div className={booking ? bookingBlock : "grid gap-3"}>
          <p className="m-0">
            Use the private link in your booking message to manage your stay. If
            you need help, contact the hotel.
          </p>
          <HotelContact contact={contact} />
        </div>
      )}
    </section>
  );
}

/** The reservation as the server holds it now. Every amount is shown as sent. */
function BookingDetails({
  booking,
  times,
}: Readonly<{ booking: Detail; times: StayTimes }>) {
  const confirmed = booking.status === "CONFIRMED";
  const { price, units } = booking;
  const payment =
    booking.paymentMethod === "PAY_AT_HOTEL"
      ? "Pay at the hotel"
      : "Online payment";
  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        {confirmed && (
          <span className="grid size-14 flex-none place-content-center border border-gold-400 text-success">
            <Icon name="check" className="size-8" />
          </span>
        )}
        <div className="grid min-w-0 gap-1">
          {confirmed && <p className={eyebrowFlush}>Your stay is booked</p>}
          <h2 className={bookingHeading}>
            {confirmed ? "Confirmed" : "Booking status"}
          </h2>
        </div>
      </div>
      {!confirmed && (
        <p className="m-0">
          Current status: {booking.status.replaceAll("_", " ").toLowerCase()}.
        </p>
      )}
      <div className="grid gap-1 border-l-2 border-gold-400 bg-canvas px-4 py-3">
        <span className={factTerm}>Booking reference</span>
        <strong className={`${figures} text-heading-lg wrap-anywhere`}>
          {booking.reference}
        </strong>
      </div>
      <dl className={factList}>
        <div className="grid min-w-0 content-start gap-0.5">
          <dt className={factTerm}>Hotel</dt>
          <dd className={factValue}>{booking.branch.name}</dd>
        </div>
        <StayDates stay={booking.stay} times={times} />
        <div className="grid min-w-0 content-start gap-0.5">
          <dt className={factTerm}>Payment method</dt>
          <dd className={factValue}>{payment}</dd>
        </div>
      </dl>
      {(units.length > 0 || price) && (
        <div className={bookingBlock}>
          <h3 className={bookingSubheading}>
            {price ? "Your stay and price" : "Your stay"}
          </h3>
          <table className="w-full border-collapse border-t border-neutral-300 text-neutral-950">
            <caption className="sr-only">Units and price of your stay</caption>
            <tbody>
              {units.map((unit, index) => (
                <PriceRow
                  key={index}
                  label={unit.roomName ?? "Accommodation"}
                  note={`${count(unit.occupancy.adults, "adult", "adults")}, ${count(unit.occupancy.children, "child", "children")}`}
                  amount={unit.subtotal ? formatMoney(unit.subtotal) : ""}
                />
              ))}
              {price && <PriceTotals price={price} />}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function PriceTotals({
  price,
}: Readonly<{ price: NonNullable<Detail["price"]> }>) {
  return (
    <>
      {price.services.map((service) => (
        <PriceRow
          key={service.kind}
          label={
            service.kind === "AIRPORT_TRANSFER" || service.kind === "BREAKFAST"
              ? serviceName[service.kind]
              : "Extra service"
          }
          note={
            [
              service.vehicles === null
                ? null
                : count(service.vehicles, "car", "cars"),
              service.details,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          amount={formatMoney(service.amountMinor)}
        />
      ))}
      <PriceRow label="Subtotal" amount={formatMoney(price.subtotalMinor)} />
      {price.discountMinor > 0 && (
        <PriceRow
          label="Discount"
          amount={`−${formatMoney(price.discountMinor)}`}
        />
      )}
      <PriceRow
        label={vatLabel(price.vatRateBasisPoints)}
        amount={formatMoney(price.vatMinor)}
      />
      <PriceRow label="Total" amount={formatMoney(price.totalMinor)} strong />
    </>
  );
}
