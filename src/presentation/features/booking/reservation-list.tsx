"use client";

import type { z } from "zod";
import { useEffect, useRef, useState } from "react";

import type { GuestReservationList } from "@/contracts/api/v1/guests";
import { formatMoney } from "@/presentation/format/money";
import { listGuestReservations } from "@/presentation/api-client/guest";
import {
  alertBox,
  bookingHeading,
  bookingSubheading,
  button,
  factList,
  factTerm,
  factValue,
} from "@/presentation/site/classes";

import { CheckAgain } from "./check-again";
import { displayDate } from "./display-date";
import { count } from "./price-row";
import { reservationStatusText } from "./reservation-wording";
import { accessRefusal, type AccessRefusal } from "./use-guest-reservation";
import type { VerificationChannel } from "./verification-state";

type Items = z.output<typeof GuestReservationList>["items"];

/** Every booking of the verified phone or email, newest first (API-G3). */
export function ReservationList({
  token,
  channel,
  otherChannel,
  notice,
  takeFocus,
  onOpen,
  onRefused,
}: Readonly<{
  token: string;
  /** How the guest proved who they are. */
  channel: VerificationChannel;
  /** True when a code can also be sent the other way. */
  otherChannel: boolean;
  notice: string | null;
  takeFocus: boolean;
  onOpen: (reference: string) => void;
  onRefused: (refusal: AccessRefusal) => void;
}>) {
  const [items, setItems] = useState<Items | null>(null);
  const [failedWait, setFailedWait] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const refused = useRef(onRefused);

  useEffect(() => {
    refused.current = onRefused;
  });

  useEffect(() => {
    if (takeFocus) heading.current?.focus();
  }, [takeFocus]);

  useEffect(() => {
    const controller = new AbortController();
    async function read() {
      const result = await listGuestReservations(token, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (result.ok) return setItems(result.data.items);
      const refusal = accessRefusal(result.problem, "SESSION");
      if (refusal) return refused.current(refusal);
      setFailedWait(result.problem.retryAfter ?? 0);
    }
    const timer = setTimeout(() => void read(), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [token, round]);

  const emptyHelp = !otherChannel
    ? "Contact the hotel if you expected to see a booking."
    : channel === "WHATSAPP"
      ? "If you booked with an email code, sign out and ask for a code by email. You can also contact the hotel."
      : "Sign out and ask for a code by WhatsApp to look by phone number. You can also contact the hotel.";

  return (
    <div className="grid gap-5">
      <h2 ref={heading} tabIndex={-1} className={bookingHeading}>
        Your bookings
      </h2>
      {notice && (
        <div role="status" className={alertBox}>
          <p className="m-0">{notice}</p>
        </div>
      )}
      <p role="status" className={items ? "sr-only" : "m-0"}>
        {items
          ? `${count(items.length, "booking", "bookings")} found.`
          : failedWait === null
            ? "Loading your bookings…"
            : ""}
      </p>
      {!items && failedWait !== null && (
        <>
          <p className="m-0">
            We couldn’t load your bookings. Please try checking again in a
            moment.
          </p>
          <CheckAgain
            waitSeconds={failedWait}
            onClick={() => {
              heading.current?.focus();
              setFailedWait(null);
              setRound((value) => value + 1);
            }}
          />
        </>
      )}
      {items?.length === 0 && (
        <div className="grid gap-2">
          <p className="m-0 font-medium">No bookings found.</p>
          <p className="m-0 text-neutral-600">{emptyHelp}</p>
        </div>
      )}
      {items && items.length > 0 && (
        <ul className="m-0 grid min-w-0 list-none gap-4 p-0">
          {items.map((item) => (
            <li
              key={item.reference}
              className="grid min-w-0 gap-4 border border-neutral-300 p-4"
            >
              <h3 className={bookingSubheading}>{item.branchName}</h3>
              <dl className={factList}>
                {[
                  ["Reference", item.reference],
                  ["Check-in", displayDate({ value: item.stay.checkIn })],
                  ["Check-out", displayDate({ value: item.stay.checkOut })],
                  ["Units", String(item.units)],
                  ["Status", reservationStatusText(item.status)],
                  ["Total", item.total ? formatMoney(item.total) : null],
                ].map(([term, value]) =>
                  value === null ? null : (
                    <div key={term} className="grid content-start gap-0.5">
                      <dt className={factTerm}>{term}</dt>
                      <dd className={`${factValue} first-letter:uppercase`}>
                        {value}
                      </dd>
                    </div>
                  ),
                )}
              </dl>
              <button
                type="button"
                className={button("ghost", "justify-self-start max-sm:w-full")}
                onClick={() => onOpen(item.reference)}
              >
                View booking <span className="sr-only">{item.reference}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
