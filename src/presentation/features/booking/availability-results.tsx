import type { Route } from "next";
import Link from "next/link";

import type { PublicAvailability } from "@/application/public";
import { MAX_UNITS_REQUESTED } from "@/domain/inventory";
import type { LocalDate } from "@/domain/shared/local-date";
import { formatMoney } from "@/presentation/format/money";
import { AccommodationBadge } from "@/presentation/site/cards";
import { link, linkIcon, sectionHeading } from "@/presentation/site/classes";
import { Icon } from "@/presentation/site/icons";
import { SiteImage } from "@/presentation/site/site-image";

import { AddBookingUnit, BookingSelection } from "./booking-selection";
import { displayDate } from "./display-date";
import { searchFeedbackId } from "./stay-search-form";

type Listing = PublicAvailability["results"][number];

/** What the selection basket needs to know about an available listing. */
const basketListing = ({ roomType, unitsAvailable }: Listing) => ({
  slug: roomType.slug,
  name: roomType.name,
  unitsAvailable,
  maxAdults: roomType.facts.maxAdults,
  maxChildren: roomType.facts.maxChildren,
});

const reasons: Record<NonNullable<Listing["reason"]>, string> = {
  SOLD_OUT: "Not available for these dates.",
  OCCUPANCY: "Does not fit the number of guests entered.",
  UNPRICED: "Rates are unavailable for these dates.",
};

function RateDetails({
  listing,
  checkIn,
}: Readonly<{ listing: Listing; checkIn: LocalDate }>) {
  const { accommodationTotal, pricePerNight } = listing;
  if (!accommodationTotal || pricePerNight.length === 0) return null;
  const firstNight = pricePerNight[0]!;
  const sameRate = pricePerNight.every(
    (rate) => rate.amountMinor === firstNight.amountMinor,
  );
  return (
    <>
      <div className="grid gap-2 border-t border-neutral-300 pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <p className="m-0 text-small text-neutral-600">
          {sameRate
            ? `${formatMoney(firstNight)} per night`
            : "Nightly rates vary"}
        </p>
        <p className="m-0 grid gap-1 text-small text-neutral-600 sm:text-right">
          <strong className="font-display text-heading-lg leading-none font-normal text-plum-900">
            {formatMoney(accommodationTotal)}
          </strong>
          Stay total for one unit, before VAT
        </p>
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-small font-medium text-plum-800">
          Show nightly prices
        </summary>
        <dl className="m-0 grid gap-2 pb-2 text-small text-neutral-800">
          {pricePerNight.map((price, offset) => {
            const night = checkIn.addDays(offset);
            return (
              <div
                key={night.value}
                className="flex flex-wrap justify-between gap-x-3 border-b border-neutral-300 pb-2"
              >
                <dt>
                  <time dateTime={night.value}>{displayDate(night)}</time>
                </dt>
                <dd className="m-0 tabular-nums">{formatMoney(price)}</dd>
              </div>
            );
          })}
        </dl>
      </details>
    </>
  );
}

function ResultCard({
  listing,
  branch,
  checkIn,
  highlighted,
}: Readonly<{
  listing: Listing;
  branch: string;
  checkIn: LocalDate;
  highlighted: boolean;
}>) {
  const { roomType } = listing;
  return (
    <article
      className={`grid h-full content-start border bg-surface ${highlighted ? "border-gold-600" : "border-neutral-300"}`}
    >
      {roomType.hero && (
        <div className="relative aspect-video bg-plum-100">
          <SiteImage
            image={roomType.hero}
            fill
            decorative
            sizes="(min-width: 76rem) 34rem, (min-width: 48rem) 50vw, 100vw"
          />
        </div>
      )}
      <div className="grid min-w-0 gap-4 p-[clamp(1rem,3vw,1.75rem)]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <AccommodationBadge type={roomType.accommodationType} />
          {highlighted && (
            <span className="text-small font-medium text-gold-600">
              Your selected listing
            </span>
          )}
        </div>
        <h3 className="m-0 font-display text-heading-lg leading-tight text-plum-900">
          {roomType.name}
        </h3>
        <p className="m-0 text-neutral-600">{roomType.shortDescription}</p>
        <RateDetails listing={listing} checkIn={checkIn} />
        <div>
          <Link
            href={`/${branch}/stay/${roomType.slug}` as Route}
            aria-label={`View details for ${roomType.name}`}
            className={link}
            prefetch={false}
          >
            View details <Icon name="arrow" className={linkIcon} />
          </Link>
        </div>
        <AddBookingUnit listing={basketListing(listing)} />
      </div>
    </article>
  );
}

export function AvailabilityResults({
  search,
  room,
}: Readonly<{ search: PublicAvailability; room: string | null }>) {
  const available = search.results.filter((listing) => listing.available);
  const unavailable = search.results.filter((listing) => !listing.available);
  const { checkIn, checkOut } = search.stay;
  const stay = { checkIn: checkIn.value, checkOut: checkOut.value };
  const { adults, children } = search.occupancy;
  return (
    <section aria-labelledby={searchFeedbackId} className="grid gap-6 md:gap-8">
      <div>
        <h2
          id={searchFeedbackId}
          tabIndex={-1}
          className={`${sectionHeading} scroll-mt-[calc(var(--header-height-compact)+1.5rem)]`}
        >
          {available.length > 0 ? "Available stays" : "No stays available"}
        </h2>
        <p className="mt-2 mb-0 text-neutral-600">
          <time dateTime={checkIn.value}>{displayDate(checkIn)}</time>
          {" to "}
          <time dateTime={checkOut.value}>{displayDate(checkOut)}</time>
        </p>
        {available.length === 0 && (
          <p className="mt-3 mb-0 text-neutral-800">
            Try different dates or adjust the number of guests.
          </p>
        )}
      </div>
      {available.length > 0 && (
        <BookingSelection
          key={`${search.branchSlug}/${stay.checkIn}/${stay.checkOut}/${adults}/${children}`}
          branchSlug={search.branchSlug}
          stay={stay}
          initialOccupancy={{ adults, children }}
          limit={MAX_UNITS_REQUESTED}
          listings={available.map(basketListing)}
        >
          <ul className="m-0 grid list-none gap-6 p-0 md:grid-cols-2">
            {available.map((listing) => (
              <li key={listing.roomType.slug} className="min-w-0">
                <ResultCard
                  listing={listing}
                  branch={search.branchSlug}
                  checkIn={checkIn}
                  highlighted={listing.roomType.slug === room}
                />
              </li>
            ))}
          </ul>
        </BookingSelection>
      )}
      {unavailable.length > 0 && (
        <section
          aria-labelledby="unavailable-stays"
          className="mt-2 grid gap-4"
        >
          <h3
            id="unavailable-stays"
            className="m-0 font-display text-heading-md text-plum-900"
          >
            Unavailable for this search
          </h3>
          <ul className="m-0 list-none border-t border-neutral-300 p-0">
            {unavailable.map(({ roomType, reason }) => (
              <li
                key={roomType.slug}
                className={`grid gap-2 border-b border-neutral-300 px-3 py-4 sm:grid-cols-2 sm:items-center ${roomType.slug === room ? "border-l-2 border-l-gold-600 bg-surface" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <AccommodationBadge type={roomType.accommodationType} />
                  <span className="font-medium text-plum-900">
                    {roomType.name}
                  </span>
                  {roomType.slug === room && (
                    <span className="text-small text-gold-600">
                      Your selected listing
                    </span>
                  )}
                </div>
                <p className="m-0 text-small text-neutral-800">
                  {reason ? reasons[reason] : "Currently unavailable."}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
