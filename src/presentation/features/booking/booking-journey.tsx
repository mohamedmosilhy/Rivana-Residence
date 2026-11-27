"use client";

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  bookingHeading,
  bookingPanel,
  button,
} from "@/presentation/site/classes";

import { clearDraft, readDraft, saveDraft } from "./booking-draft";
import {
  initialExtras,
  isPriced,
  type Extras,
  type OfferedService,
  type PaymentMethods,
  type Quote,
} from "./extras-state";
import type { ReviewTerms } from "./booking-review";
import type { BookingSelectionBase } from "./extras-step";
import type { GuestDetails, GuestDetailsErrors } from "./guest-details";
import { GuestDetailsForm, type PhoneCountry } from "./guest-details-form";
import { HotelContact, type HotelContactDetails } from "./hotel-contact";
import { bookingResultsHref } from "./selection-link";
import {
  noVerification,
  verificationFor,
  type Verification,
  type VerificationLifetimes,
} from "./verification-state";

const PhoneVerificationStep = lazy(async () => ({
  default: (await import("./phone-verification-step")).PhoneVerificationStep,
}));

const ExtrasStep = lazy(async () => ({
  default: (await import("./extras-step")).ExtrasStep,
}));
const BookingCheckout = lazy(async () => ({
  default: (await import("./booking-checkout")).BookingCheckout,
}));
const PriceSummary = lazy(async () => ({
  default: (await import("./price-summary")).PriceSummary,
}));

type JourneyProps = Readonly<{
  /** The server rendered stay summary, shown until the extras step. */
  summary: ReactNode;
  terms: ReviewTerms;
  selection: BookingSelectionBase;
  services: readonly OfferedService[];
  maxVehicles: number | null;
  /** The server's price of the selection with nothing added. */
  price: Readonly<{ quote: Quote; paymentMethods: PaymentMethods }>;
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
  if (inBrowser) return <JourneySteps {...props} />;
  return (
    <JourneyLayout summary={props.summary}>
      <noscript>
        <p className="mt-0">
          Enable JavaScript to book online, or contact the hotel.
        </p>
        <HotelContact contact={props.contact} />
      </noscript>
    </JourneyLayout>
  );
}

function JourneyLayout({
  summary,
  children,
}: Readonly<{ summary: ReactNode; children: ReactNode }>) {
  return (
    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.48fr)]">
      <div className="min-w-0 lg:order-2">{summary}</div>
      <div className={`${bookingPanel} min-h-96 min-w-0`}>{children}</div>
    </div>
  );
}

function JourneySteps({
  summary,
  terms,
  selection,
  services,
  maxVehicles,
  price,
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
  /** The step after details: verification, extras, then payment. */
  const [step, setStep] = useState<"verify" | "extras" | "payment">("verify");
  /** Kept here, so going back or verifying again loses no choice. */
  const [extras, setExtras] = useState<Extras>(() =>
    initialExtras(price.quote, price.paymentMethods),
  );
  const [extrasSeen, setExtrasSeen] = useState(false);

  function change(next: GuestDetails) {
    setDetails(next);
    saveDraft(contact.slug, next);
  }

  function backToDetails() {
    setConfirmed(null);
    setReturned(true);
  }

  const onExtras =
    !blocked &&
    confirmed !== null &&
    step === "extras" &&
    verification.verified !== null;
  const [checkoutView, setCheckoutView] = useState<"payment" | "review">(
    "payment",
  );
  const [chosenMethod, chooseMethod] = useState<PaymentMethods[number] | null>(
    null,
  );
  const [oldPrice, setOldPrice] = useState<Quote["total"] | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutStale, setCheckoutStale] = useState<string | null>(null);
  const stale =
    checkoutStale ??
    (extras.problem?.kind === "unavailable"
      ? "Your selection is no longer available."
      : extras.problem?.kind === "closed"
        ? "Online booking is unavailable."
        : isPriced(extras)
          ? null
          : !onExtras
            ? "The price updates when you return to extras."
            : extras.problem
              ? "The price needs checking."
              : "Updating price…");

  function content() {
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
            setStep("verify");
            setConfirmed({ ...next, e164 });
          }}
        />
      );

    if (step === "extras" && verification.verified)
      return (
        <Suspense fallback={<p role="status">Loading extras…</p>}>
          <ExtrasStep
            selection={selection}
            services={services}
            maxVehicles={maxVehicles}
            value={extras}
            emailVerified={verification.verified.channel === "EMAIL"}
            contact={contact}
            onChange={setExtras}
            onBack={() => setStep("verify")}
            onEdit={backToDetails}
            onContinue={() => setStep("payment")}
          />
        </Suspense>
      );

    if (step === "payment" && verification.verified)
      return (
        <Suspense fallback={<p role="status">Loading payment…</p>}>
          <BookingCheckout
            selection={selection}
            guest={confirmed}
            verified={verification.verified}
            terms={terms}
            contact={contact}
            extras={extras}
            services={services}
            onChange={setExtras}
            chosen={chosenMethod}
            choose={chooseMethod}
            oldPrice={oldPrice}
            setOldPrice={setOldPrice}
            view={checkoutView}
            onView={setCheckoutView}
            onLock={setCheckoutBusy}
            onPriceStatus={setCheckoutStale}
            onBack={() => {
              setCheckoutView("payment");
              setStep("extras");
            }}
            onVerify={() => {
              setVerification(noVerification);
              setCheckoutView("payment");
              setStep("verify");
            }}
            onBlocked={() => {
              clearDraft(contact.slug);
              setVerification(noVerification);
              setBlocked(true);
            }}
          />
        </Suspense>
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
          <button
            type="button"
            className={button("primary", "justify-self-start max-sm:w-full")}
            onClick={() => {
              setExtrasSeen(true);
              setStep("extras");
            }}
          >
            Continue to extras
          </button>
        </PhoneVerificationStep>
      </Suspense>
    );
  }

  return (
    <JourneyLayout
      summary={
        extrasSeen ? (
          <Suspense fallback={summary}>
            <PriceSummary
              quote={extras.priced.quote}
              stale={stale}
              nightly={step === "payment" && checkoutView === "review"}
              allowChange={!checkoutBusy}
              changeHref={bookingResultsHref(
                selection.branchSlug,
                selection.stay,
                selection.lines,
              )}
            />
          </Suspense>
        ) : (
          summary
        )
      }
    >
      {content()}
    </JourneyLayout>
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
