"use client";

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { bookingHeading, bookingPanel } from "@/presentation/site/classes";

import { clearDraft, readDraft, saveDraft } from "./booking-draft";
import type { GuestDetails, GuestDetailsErrors } from "./guest-details";
import { GuestDetailsForm, type PhoneCountry } from "./guest-details-form";
import { HotelContact, type HotelContactDetails } from "./hotel-contact";
import {
  noVerification,
  verificationFor,
  type Verification,
  type VerificationLifetimes,
} from "./verification-state";

const PhoneVerificationStep = lazy(async () => ({
  default: (await import("./phone-verification-step")).PhoneVerificationStep,
}));

type JourneyProps = Readonly<{
  countries: readonly PhoneCountry[];
  channels: Readonly<{ whatsapp: boolean; email: boolean }>;
  lifetimes: VerificationLifetimes;
  contact: HotelContactDetails;
}>;

const subscribe = () => () => {};

/** The steps after the selection. The saved draft is read in the browser only. */
export function BookingJourney(props: JourneyProps) {
  const inBrowser = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <div className={`${bookingPanel} min-h-96 min-w-0`}>
      {inBrowser ? (
        <JourneySteps {...props} />
      ) : (
        <noscript>
          <p className="mt-0">
            Enable JavaScript to book online, or contact the hotel.
          </p>
          <HotelContact contact={props.contact} />
        </noscript>
      )}
    </div>
  );
}

function JourneySteps({
  countries,
  channels,
  lifetimes,
  contact,
}: JourneyProps) {
  const [details, setDetails] = useState(() =>
    readDraft(
      contact.slug,
      countries.map(({ code }) => code),
    ),
  );
  /** The values that passed step 1; null while step 1 is open. */
  const [confirmed, setConfirmed] = useState<
    (GuestDetails & { e164: string }) | null
  >(null);
  const [returned, setReturned] = useState(false);
  const [errors, setErrors] = useState<GuestDetailsErrors>({});
  const [verification, setVerification] =
    useState<Verification>(noVerification);
  const [blocked, setBlocked] = useState(false);

  function change(next: GuestDetails) {
    setDetails(next);
    saveDraft(contact.slug, next);
  }

  function backToDetails() {
    setConfirmed(null);
    setReturned(true);
  }

  if (blocked) return <Blocked contact={contact} />;

  if (!confirmed)
    return (
      <GuestDetailsForm
        value={details}
        countries={countries}
        errors={errors}
        focusHeading={returned}
        onChange={change}
        onErrors={setErrors}
        onContinue={(next, e164) => {
          change(next);
          setVerification((current) =>
            verificationFor(current, e164, next.email),
          );
          setConfirmed({ ...next, e164 });
        }}
      />
    );

  return (
    <Suspense fallback={<p role="status">Loading verification…</p>}>
      <PhoneVerificationStep
        phone={confirmed.e164}
        email={confirmed.email}
        channels={channels}
        lifetimes={lifetimes}
        value={verification}
        contact={contact}
        onChange={setVerification}
        onBlocked={() => {
          clearDraft(contact.slug);
          setVerification(noVerification);
          setBlocked(true);
        }}
        onInvalidContact={(refused) => {
          setErrors(refused);
          backToDetails();
        }}
        onEdit={backToDetails}
      >
        <div className="grid gap-2">
          <p className="m-0">
            Extras and payment are coming soon. Contact the hotel to book.
          </p>
          <HotelContact contact={contact} />
        </div>
      </PhoneVerificationStep>
    </Suspense>
  );
}

/** Says nothing about why: the hotel handles a blocked number. */
function Blocked({ contact }: Readonly<{ contact: HotelContactDetails }>) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className="grid gap-3">
      <h2 ref={heading} tabIndex={-1} className={bookingHeading}>
        Contact the hotel
      </h2>
      <p className="m-0">Please contact the hotel to continue.</p>
      <HotelContact contact={contact} />
    </div>
  );
}
