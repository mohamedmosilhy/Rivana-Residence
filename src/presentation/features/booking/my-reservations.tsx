"use client";

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  bookingHeading,
  bookingPanel,
  link,
} from "@/presentation/site/classes";

import { forgetBookingResult } from "./booking-result";
import {
  FindReservationsForm,
  type FindErrors,
  type FindValues,
} from "./find-reservations-form";
import {
  forgetGuestSession,
  forgetManageToken,
  keepGuestSession,
  readGuestSession,
  type GuestSession,
} from "./guest-access-store";
import { DEFAULT_PHONE_COUNTRY } from "./guest-details";
import type { PhoneCountry } from "./guest-details-form";
import { HotelContacts, type GuestHotel } from "./hotel-contacts";
import { ReservationList } from "./reservation-list";
import type { AccessRefusal } from "./use-guest-reservation";
import {
  noVerification,
  verificationFor,
  type Verification,
  type VerificationChannel,
  type VerificationLifetimes,
} from "./verification-state";

const PhoneVerificationStep = lazy(async () => ({
  default: (await import("./phone-verification-step")).PhoneVerificationStep,
}));
const ReservationView = lazy(async () => ({
  default: (await import("./reservation-view")).ReservationView,
}));

const ENDED = "Your access has ended. Get a new code to continue.";
const emptyValues: FindValues = {
  channel: "WHATSAPP",
  country: DEFAULT_PHONE_COUNTRY,
  phone: "",
  email: "",
};
const panel = `${bookingPanel} mx-auto grid w-full max-w-3xl min-w-0 content-start gap-5`;

/**
 * "My reservations": a code proves a phone or an email, then the guest sees
 * those bookings for 30 minutes (US-G7, API-P9, P10, G3, G4).
 */
export function MyReservations({
  channels,
  countries,
  hotels,
  lifetimes,
}: Readonly<{
  /** Which codes can be sent now. */
  channels: Readonly<{ whatsapp: boolean; email: boolean }>;
  countries: readonly PhoneCountry[];
  hotels: readonly GuestHotel[];
  lifetimes: VerificationLifetimes;
}>) {
  const offered: VerificationChannel[] = [
    ...(channels.whatsapp ? (["WHATSAPP"] as const) : []),
    ...(channels.email ? (["EMAIL"] as const) : []),
  ];
  const [opened, setOpened] = useState(false);
  const [session, setSession] = useState<GuestSession | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [values, setValues] = useState(emptyValues);
  const [errors, setErrors] = useState<FindErrors>({});
  /** The contact a code is being asked for: step 2. */
  const [contact, setContact] = useState<Readonly<{
    channel: VerificationChannel;
    phone: string;
    email: string;
  }> | null>(null);
  const [verification, setVerification] =
    useState<Verification>(noVerification);
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** True once the screen has changed, so the new one takes focus. */
  const [moved, setMoved] = useState(false);
  const blockedHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Storage is read after the server's markup has been matched.
    const timer = setTimeout(() => {
      setSession(readGuestSession(Date.now()));
      setOpened(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  /** Drops the session and returns to the first step. */
  function end(message: string) {
    forgetGuestSession();
    setSession(null);
    setReference(null);
    setContact(null);
    setVerification(noVerification);
    setNotice(message);
    setMoved(true);
  }

  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(
      () => end(ENDED),
      Math.max(session.expiresAtMs - Date.now(), 0),
    );
    return () => clearTimeout(timer);
    // `end` only sets state, so the session alone restarts the timer.
  }, [session]);

  useEffect(() => {
    if (blocked) blockedHeading.current?.focus();
  }, [blocked]);

  function block() {
    end("");
    setBlocked(true);
  }

  function refused(refusal: AccessRefusal) {
    if (refusal === "session") return end(ENDED);
    if (refusal === "blocked") return block();
    setReference(null);
    setNotice("That booking is no longer in your list.");
    setMoved(true);
  }

  function verified(next: Verification) {
    if (!next.verified) return setVerification(next);
    const { token, channel, expiresAtMs } = next.verified;
    const started = { token, channel, expiresAtMs };
    keepGuestSession(started);
    setSession(started);
    setContact(null);
    setVerification(noVerification);
    setNotice(null);
    setMoved(true);
  }

  if (!opened)
    return (
      <section className={panel}>
        {/* Words that stay true if no script ever runs. */}
        <h2 className={bookingHeading}>Your reservations</h2>
        <noscript>
          <p>Enable JavaScript to see your bookings, or contact the hotel.</p>
          <HotelContacts hotels={hotels} />
        </noscript>
      </section>
    );

  if (blocked)
    return (
      <section className={panel}>
        <h2 ref={blockedHeading} tabIndex={-1} className={bookingHeading}>
          Please contact the hotel to continue
        </h2>
        <HotelContacts hotels={hotels} />
      </section>
    );

  if (session)
    return (
      <div className="mx-auto grid w-full max-w-3xl min-w-0 gap-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 border border-neutral-300 bg-surface px-[clamp(1.125rem,3vw,2rem)] py-1">
          {reference ? (
            <button
              type="button"
              className={link}
              onClick={() => {
                setReference(null);
                setNotice(null);
                setMoved(true);
              }}
            >
              Back to my reservations
            </button>
          ) : (
            <p className="m-0 text-small text-neutral-600">
              Access lasts 30 minutes in this tab.
            </p>
          )}
          <button
            type="button"
            className={link}
            onClick={() => {
              // Signing out leaves no key to any booking in this tab.
              forgetManageToken();
              forgetBookingResult();
              setValues(emptyValues);
              setErrors({});
              end("You have signed out.");
            }}
          >
            Sign out
          </button>
        </div>
        {reference ? (
          <Suspense fallback={<p role="status">Loading your booking…</p>}>
            <OpenedReservation key={reference}>
              <ReservationView
                access={{
                  kind: "SESSION",
                  token: session.token,
                  reference,
                }}
                hotels={hotels}
                emailSession={session.channel === "EMAIL"}
                onRefused={refused}
              />
            </OpenedReservation>
          </Suspense>
        ) : (
          <section className={panel}>
            <ReservationList
              token={session.token}
              channel={session.channel}
              otherChannel={offered.some((item) => item !== session.channel)}
              notice={notice}
              takeFocus={moved}
              onRefused={refused}
              onOpen={(next) => {
                setNotice(null);
                setReference(next);
              }}
            />
          </section>
        )}
      </div>
    );

  if (offered.length === 0)
    return (
      <section className={panel}>
        <h2 className={bookingHeading}>Codes can’t be sent right now</h2>
        <p className="m-0">
          Use the private link in your booking message, or contact the hotel.
        </p>
        <HotelContacts hotels={hotels} />
      </section>
    );

  if (contact) {
    const kept = verificationFor(verification, contact.phone, contact.email);
    return (
      <section className={panel}>
        <Suspense fallback={<p role="status">Loading verification…</p>}>
          <PhoneVerificationStep
            purpose="GUEST_SESSION"
            phone={contact.phone}
            email={contact.email}
            channels={{
              whatsapp: contact.channel === "WHATSAPP",
              email: contact.channel === "EMAIL",
            }}
            lifetimes={lifetimes}
            // A code sent the other way does not belong to this choice.
            value={
              kept.sent && kept.sent.channel !== contact.channel
                ? noVerification
                : kept
            }
            help={<HotelContacts hotels={hotels} />}
            onChange={verified}
            onBlocked={block}
            onInvalidContact={(wrong) => {
              setErrors(wrong);
              setContact(null);
              setMoved(true);
            }}
            onEdit={() => {
              setContact(null);
              setMoved(true);
            }}
          />
        </Suspense>
      </section>
    );
  }

  return (
    <section className={panel}>
      <FindReservationsForm
        channels={offered}
        countries={countries}
        value={values}
        errors={errors}
        notice={notice}
        takeFocus={moved}
        onChange={setValues}
        onErrors={setErrors}
        onContinue={(phone, email) => {
          setNotice(null);
          setContact({
            channel: offered.includes(values.channel)
              ? values.channel
              : offered[0]!,
            phone,
            email,
          });
        }}
      />
    </section>
  );
}

/** Brings a booking opened from the list into view and to screen readers. */
function OpenedReservation({ children }: Readonly<{ children: ReactNode }>) {
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => frame.current?.focus(), []);
  return (
    <div
      ref={frame}
      tabIndex={-1}
      className="min-w-0 scroll-mt-[calc(var(--header-height-compact)+1.5rem)] focus:[outline:none]"
    >
      {children}
    </div>
  );
}
