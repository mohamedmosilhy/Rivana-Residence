import type { z } from "zod";

import type { GuestReservation } from "@/contracts/api/v1/guests";
import { formatMoney } from "@/presentation/format/money";
import {
  bookingBlock,
  bookingHeading,
  bookingSubheading,
  eyebrowFlush,
  factList,
  factTerm,
  factValue,
  figures,
} from "@/presentation/site/classes";
import { Icon } from "@/presentation/site/icons";

import { serviceName } from "./extras-answer";
import { count, PriceRow, vatLabel } from "./price-row";
import { StayDates, type StayTimes } from "./stay-dates";

export type BookingDetail = z.output<typeof GuestReservation>;

/** The reservation as the server holds it now. Every amount is shown as sent. */
export function BookingDetails({
  booking,
  times,
}: Readonly<{ booking: BookingDetail; times: StayTimes }>) {
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
}: Readonly<{ price: NonNullable<BookingDetail["price"]> }>) {
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
