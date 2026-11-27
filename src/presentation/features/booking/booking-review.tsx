import {
  bookingBlock,
  bookingSubheading,
  button,
  choiceCard,
  choiceInput,
  factList,
  factTerm,
  factValue,
} from "@/presentation/site/classes";
import { bookingPolicyCopy } from "./booking-policy-copy";
import { serviceName } from "./extras-answer";
import type { Extras, OfferedService, ServiceKind } from "./extras-state";
import type { GuestDetails } from "./guest-details";
import { servicePrice } from "./services-picker";

export type ReviewTerms = Readonly<{
  branchName: string;
  deadlineLabel: string | null;
  timeZone: string;
  insideWindow: boolean;
  consentVersions: { privacyNotice: string; marketing: string };
}>;

function Fact({ term, value }: Readonly<{ term: string; value: string }>) {
  return (
    <div className="grid min-w-0 content-start gap-0.5">
      <dt className={factTerm}>{term}</dt>
      <dd className={factValue}>{value}</dd>
    </div>
  );
}

export function BookingReview({
  terms,
  paymentLabel,
  guest,
  extras,
  offered,
  onAdd,
  locked,
  privacy,
  onPrivacy,
  marketing,
  onMarketing,
}: Readonly<{
  terms: ReviewTerms;
  paymentLabel: string | null;
  guest: GuestDetails & { e164: string };
  extras: Extras;
  offered: readonly OfferedService[];
  onAdd: (kind: ServiceKind) => void;
  locked: boolean;
  privacy: boolean;
  onPrivacy: (checked: boolean) => void;
  marketing: boolean | null;
  onMarketing: (checked: boolean) => void;
}>) {
  return (
    <>
      <section aria-labelledby="review-stay" className={bookingBlock}>
        <h3 id="review-stay" className={bookingSubheading}>
          Stay and payment
        </h3>
        <dl className={factList}>
          <Fact term="Hotel" value={terms.branchName} />
          {paymentLabel && <Fact term="Payment method" value={paymentLabel} />}
        </dl>
      </section>
      <section aria-labelledby="review-guest" className={bookingBlock}>
        <h3 id="review-guest" className={bookingSubheading}>
          Guest
        </h3>
        <dl className={factList}>
          <Fact term="Name" value={guest.fullName} />
          <Fact term="Phone" value={guest.e164} />
          <Fact term="Email" value={guest.email} />
          {guest.specialRequests && (
            <Fact term="Special requests" value={guest.specialRequests} />
          )}
          {extras.transfer && extras.flightDetails && (
            <Fact term="Flight for the transfer" value={extras.flightDetails} />
          )}
        </dl>
      </section>
      {offered.length > 0 && (
        <section aria-labelledby="review-extras" className={bookingBlock}>
          <h3 id="review-extras" className={bookingSubheading}>
            Optional extras
          </h3>
          {offered.map((service) => (
            <div
              key={service.kind}
              className="grid min-w-0 items-center gap-x-4 gap-y-3 border border-dashed border-control-border p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <p className="m-0 text-small text-neutral-600">
                <strong className="block text-base font-medium text-plum-900">
                  {serviceName[service.kind]}
                </strong>
                {servicePrice(service)} before VAT
              </p>
              <button
                type="button"
                disabled={locked}
                className={button("ghost", "max-sm:w-full")}
                onClick={() => onAdd(service.kind)}
              >
                Add {serviceName[service.kind].toLowerCase()}
              </button>
            </div>
          ))}
        </section>
      )}
      <section aria-labelledby="review-policies" className={bookingBlock}>
        <h3 id="review-policies" className={bookingSubheading}>
          Cancellation and policies
        </h3>
        <p className="m-0 border-l-2 border-gold-400 bg-canvas px-4 py-3">
          {terms.insideWindow
            ? "The online cancellation deadline has passed. Contact the hotel to request cancellation."
            : `Request cancellation online until ${terms.deadlineLabel} (${terms.timeZone}), 24 hours before check-in. After that, contact the hotel.`}
        </p>
        <div className="grid gap-2 text-small text-neutral-600">
          <p className="m-0">{bookingPolicyCopy.cancellation}</p>
          <p className="m-0">{bookingPolicyCopy.children}</p>
          <p className="m-0">{bookingPolicyCopy.privacy}</p>
        </div>
      </section>
      <div className={bookingBlock}>
        <label className={choiceCard}>
          <input
            type="checkbox"
            className={choiceInput}
            disabled={locked}
            checked={privacy}
            onChange={(e) => onPrivacy(e.target.checked)}
          />
          I accept the privacy notice (required).
        </label>
        {marketing !== null && (
          <label className={choiceCard}>
            <input
              type="checkbox"
              className={choiceInput}
              disabled={locked}
              checked={marketing}
              onChange={(e) => onMarketing(e.target.checked)}
            />
            {bookingPolicyCopy.marketing}
          </label>
        )}
      </div>
    </>
  );
}
