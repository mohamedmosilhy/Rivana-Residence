"use client";

import { useEffect, useState } from "react";
import { getGuestReservation } from "@/presentation/api-client/guest";
import {
  bookingBlock,
  bookingHeading,
  bookingPanel,
  link,
} from "@/presentation/site/classes";
import { BookingDetails, type BookingDetail } from "./booking-details";
import { readBookingResult } from "./booking-result";
import { HotelContact, type HotelContactDetails } from "./hotel-contact";
import type { StayTimes } from "./stay-dates";

type Answer = BookingDetail | "missing" | "retry" | null;

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
