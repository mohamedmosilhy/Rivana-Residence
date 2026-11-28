"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";

import type { GuestAccess } from "@/presentation/api-client/guest";
import {
  alertBox,
  bookingBlock,
  bookingHeading,
  bookingPanel,
  bookingSubheading,
  button,
  factTerm,
  factValue,
} from "@/presentation/site/classes";

import { BookingDetails, type BookingDetail } from "./booking-details";
import { CancellationRequestForm } from "./cancellation-request";
import { CheckAgain } from "./check-again";
import { displayInstant } from "./display-date";
import { HotelContact } from "./hotel-contact";
import type { GuestHotel } from "./hotel-contacts";
import {
  cancellationNote,
  changeNote,
  noCancellationReason,
  paymentStatusText,
  type RequestNote,
} from "./reservation-wording";
import type { StayTimes } from "./stay-dates";
import {
  useGuestReservation,
  type AccessRefusal,
} from "./use-guest-reservation";

const ChangeBooking = lazy(async () => ({
  default: (await import("./change-booking")).ChangeBooking,
}));

const noTimes: StayTimes = {
  checkInTime: null,
  checkInUntilTime: null,
  checkOutTime: null,
  checkOutFromTime: null,
};

/**
 * One booking with its requests, for the manage link and "My reservations".
 * Give it a `key` of the booking it shows.
 */
export function ReservationView({
  access,
  hotels,
  emailSession = false,
  onRefused,
}: Readonly<{
  access: GuestAccess;
  hotels: readonly GuestHotel[];
  /** "My reservations" opened with an email code. */
  emailSession?: boolean;
  onRefused: (refusal: AccessRefusal) => void;
}>) {
  const { booking, loading, failedWait, reload } = useGuestReservation(
    access,
    onRefused,
  );
  // An object, so the same outcome twice takes focus both times.
  const [notice, setNotice] = useState<{ text: string } | null>(null);
  const [changing, setChanging] = useState(false);
  const noticeText = useRef<HTMLParagraphElement>(null);
  const panel = useRef<HTMLElement>(null);
  const returned = useRef(false);

  useEffect(() => {
    if (notice) noticeText.current?.focus();
  }, [notice]);

  // The change screens remove themselves, so the booking takes the focus.
  useEffect(() => {
    if (changing || !returned.current) return;
    returned.current = false;
    if (!notice) panel.current?.focus();
  }, [changing, notice]);

  function closeChange(message: string | null) {
    returned.current = true;
    setChanging(false);
    setNotice(message ? { text: message } : null);
    reload();
  }

  function checkAgain() {
    panel.current?.focus();
    reload();
  }

  const hotel = hotels.find(({ slug }) => slug === booking?.branch.slug);
  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-label="Your booking"
      className={`${bookingPanel} mx-auto grid w-full max-w-3xl min-w-0 content-start gap-5 scroll-mt-[calc(var(--header-height-compact)+1.5rem)]`}
    >
      <p
        role="status"
        className={booking || failedWait !== null ? "sr-only" : "m-0"}
      >
        {loading
          ? "Loading your booking…"
          : booking && failedWait === null
            ? "Booking details loaded."
            : ""}
      </p>
      {!booking && failedWait !== null && (
        <>
          <h2 className={bookingHeading}>We couldn’t load your booking</h2>
          <p className="m-0">Please try checking again in a moment.</p>
          <CheckAgain waitSeconds={failedWait} onClick={checkAgain} />
        </>
      )}
      {booking && changing && (
        <Suspense fallback={<p role="status">Loading the change form…</p>}>
          <ChangeBooking
            access={access}
            booking={booking}
            options={hotel?.change ?? null}
            times={hotel?.times ?? noTimes}
            contactPage={hotel !== undefined}
            emailSession={emailSession}
            onClose={closeChange}
            onRefused={onRefused}
          />
        </Suspense>
      )}
      {booking && !changing && (
        <>
          <BookingDetails
            booking={booking}
            times={hotel?.times ?? noTimes}
            moreFacts={
              <div className="grid min-w-0 content-start gap-0.5">
                <dt className={factTerm}>Payment status</dt>
                <dd className={`${factValue} first-letter:uppercase`}>
                  {paymentStatusText(booking.paymentStatus)}
                </dd>
              </div>
            }
          />
          {booking.contact && <GuestBlock contact={booking.contact} />}
          <div className={bookingBlock}>
            <h3 className={bookingSubheading}>Changes and cancellation</h3>
            {notice && (
              <p
                ref={noticeText}
                tabIndex={-1}
                className="m-0 border-l-2 border-gold-400 bg-canvas px-4 py-3"
              >
                {notice.text}
              </p>
            )}
            <Note note={changeNote(booking)} />
            <Note note={cancellationNote(booking)} />
            {failedWait !== null ? (
              <>
                <div role="alert" className={alertBox}>
                  <p className="m-0 text-danger">
                    We couldn’t check your booking again, so what you see may be
                    out of date. Check again before sending a request.
                  </p>
                </div>
                <CheckAgain waitSeconds={failedWait} onClick={checkAgain} />
              </>
            ) : loading ? (
              <p className="m-0">Checking your booking…</p>
            ) : (
              <Actions
                onChangeBooking={() => {
                  setNotice(null);
                  setChanging(true);
                }}
                booking={booking}
                access={access}
                onRefused={onRefused}
                onSettled={(text) => {
                  setNotice({ text });
                  reload();
                }}
              />
            )}
          </div>
          <div className={bookingBlock}>
            <h3 className={bookingSubheading}>Contact the hotel</h3>
            <HotelContact
              contact={booking.branch}
              contactPage={hotel !== undefined}
            />
          </div>
        </>
      )}
    </section>
  );
}

function Note({ note }: Readonly<{ note: RequestNote | null }>) {
  if (!note) return null;
  return (
    <div className="grid gap-1 border-l-2 border-gold-400 bg-canvas px-4 py-3">
      <h4 className="m-0 text-body-lg font-medium text-plum-900">
        {note.title}
      </h4>
      {note.lines.map((line) => (
        <p key={line} className="m-0 wrap-anywhere">
          {line}
        </p>
      ))}
    </div>
  );
}

/** What the server still allows for this booking, and why when it does not. */
function Actions({
  booking,
  access,
  onChangeBooking,
  onSettled,
  onRefused,
}: Readonly<{
  booking: BookingDetail;
  access: GuestAccess;
  onChangeBooking: () => void;
  onSettled: (message: string) => void;
  onRefused: (refusal: AccessRefusal) => void;
}>) {
  // Read once for each answer from the server: it only chooses wording.
  const [readAt] = useState(() => Date.now());
  const deadline = booking.cancellationDeadline;
  const change = booking.allowedActions.includes("CHANGE_RESERVATION");
  if (booking.allowedActions.includes("REQUEST_CANCELLATION"))
    return (
      <>
        {deadline && (
          <p className="m-0">
            {change
              ? "You can change this booking or ask to cancel online until"
              : "You can ask to cancel online until"}{" "}
            <time dateTime={deadline}>
              {displayInstant(deadline, booking.branch.timeZone)}
            </time>{" "}
            (hotel time).
          </p>
        )}
        {change ? (
          <button
            type="button"
            className={button("primary", "justify-self-start max-sm:w-full")}
            onClick={onChangeBooking}
          >
            Change booking
          </button>
        ) : (
          <p className="m-0">To change this booking, contact the hotel.</p>
        )}
        <CancellationRequestForm
          access={access}
          onSettled={onSettled}
          onRefused={onRefused}
        />
      </>
    );
  const reason = noCancellationReason(booking, readAt);
  if (reason) return <p className="m-0">{reason}</p>;
  const { cancellationRequest, changeRequest } = booking;
  return cancellationRequest || changeRequest ? null : (
    <p className="m-0">
      Contact the hotel with any question about this booking.
    </p>
  );
}

function GuestBlock({
  contact,
}: Readonly<{ contact: NonNullable<BookingDetail["contact"]> }>) {
  const facts = [
    ["Name", contact.fullName],
    ["Email", contact.email],
    ["Phone", contact.phone],
    ["Special requests", contact.specialRequests],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]));
  return (
    <div className={bookingBlock}>
      <h3 className={bookingSubheading}>Guest details</h3>
      {/* Two columns at most, so an email address has room. */}
      <dl className="m-0 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {facts.map(([term, value]) => (
          <div key={term} className="grid min-w-0 content-start gap-0.5">
            <dt className={factTerm}>{term}</dt>
            <dd className={factValue}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
