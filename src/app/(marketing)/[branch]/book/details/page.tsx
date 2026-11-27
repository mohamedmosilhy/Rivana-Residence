import type { Metadata, Route } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { displayQuote } from "@/application/quotes";
import {
  getBookingSetup,
  quoteBookingDetails,
} from "@/composition/booking-details";
import { CancellationDeadline } from "@/domain/reservations";
import { VERIFICATION_POLICY } from "@/domain/guests";
import { BookingJourney } from "@/presentation/features/booking/booking-journey";
import {
  BookingContact,
  BookingSearchFrame,
} from "@/presentation/features/booking/booking-search-frame";
import {
  bookingDetailsHref,
  bookingResultsHref,
} from "@/presentation/features/booking/selection-link";
import { SelectionSummary } from "@/presentation/features/booking/selection-summary";
import {
  bookingHeading,
  bookingPanel,
  button,
} from "@/presentation/site/classes";

import {
  pageMetadata,
  requireBranch,
  type BranchParams,
} from "../../../site-content";

import { readDetailsQuery } from "./details-query";
import { phoneCountries } from "./phone-countries";

export async function generateMetadata({
  params,
}: BranchParams): Promise<Metadata> {
  const branch = await requireBranch(params);
  return {
    ...(await pageMetadata({
      title: `Your booking at ${branch.name}`,
      description: branch.summary,
      path: `/${branch.slug}/book/details`,
      image: branch.hero,
    })),
    robots: { index: false, follow: false },
  };
}

async function runQuote(input: unknown) {
  const requestHeaders = await headers();
  try {
    return await quoteBookingDetails(input, requestHeaders);
  } catch (error) {
    // Driver messages may include query details. Log only the class.
    const name = error instanceof Error ? error.name : typeof error;
    console.error(`[booking-details] quote failed: ${name}`);
    return null;
  }
}

export default async function BookingDetailsPage({
  params,
  searchParams,
}: PageProps<"/[branch]/book/details">) {
  const branch = await requireBranch(params);
  const setup = await getBookingSetup(branch.id);
  if (!setup) notFound();

  const contact = {
    slug: branch.slug,
    phone: setup.phone,
    email: setup.email,
  };
  const closed = (
    <BookingSearchFrame branch={branch} title="Your booking">
      <BookingContact {...contact} />
    </BookingSearchFrame>
  );
  if (!setup.bookable) return closed;

  const query = readDetailsQuery(await searchParams);
  if (!query.ok) {
    redirect(
      bookingResultsHref(branch.slug, query.stay, [], "selection") as Route,
    );
  }
  const { stay, lines } = query;
  const result = await runQuote({
    branchSlug: branch.slug,
    stay,
    lines,
    services: [],
  });
  if (result && !result.ok) {
    if (result.error.code === "NOT_FOUND") notFound();
    if (result.error.code === "VALIDATION") {
      redirect(bookingResultsHref(branch.slug, stay, [], "selection") as Route);
    }
  }
  if (!result?.ok) {
    const limited = result?.error.code === "RATE_LIMITED";
    return (
      <BookingSearchFrame branch={branch} title="Your booking">
        <div role="alert" className={`${bookingPanel} grid gap-3`}>
          <h2 className={bookingHeading}>
            {limited
              ? "Too many price checks"
              : "We couldn’t check your selection"}
          </h2>
          <p className="m-0">
            {limited
              ? `Please wait ${result.error.retryAfterSeconds ?? 60} seconds, then try again.`
              : "Please try again in a moment."}
          </p>
          <Link
            href={bookingDetailsHref(branch.slug, stay, lines) as Route}
            prefetch={false}
            className={button("primary", "justify-self-start max-sm:w-full")}
          >
            Try again
          </Link>
        </div>
      </BookingSearchFrame>
    );
  }

  const { available, bookable, quote, paymentMethods } = result.value;
  if (!available || !quote) {
    redirect(
      bookingResultsHref(branch.slug, stay, lines, "unavailable") as Route,
    );
  }
  // An email code is offered only when this quote can be paid online (AC-14).
  const channels = {
    whatsapp: setup.channels.whatsapp,
    email: setup.channels.email && paymentMethods.includes("ONLINE"),
  };
  if (!bookable || (!channels.whatsapp && !channels.email)) return closed;

  const { codeLifetimeMs, tokenLifetimeMs } = VERIFICATION_POLICY;
  const money = ({ amountMinor }: { amountMinor: number }) => ({
    amountMinor,
    currency: "USD" as const,
  });
  const deadline = CancellationDeadline.for(setup, quote.stay.checkIn);
  const deadlineLabel =
    deadline &&
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: setup.timeZone,
    }).format(deadline);
  const times = {
    checkInTime: setup.checkInTime,
    checkInUntilTime: setup.checkInUntilTime,
    checkOutTime: setup.checkOutTime,
    checkOutFromTime: setup.checkOutFromTime,
  };
  return (
    <BookingSearchFrame branch={branch} title="Your booking">
      <BookingJourney
        // A changed selection starts its own verification and extras.
        key={bookingDetailsHref(branch.slug, stay, lines)}
        summary={
          <SelectionSummary
            quote={quote}
            times={times}
            changeHref={bookingResultsHref(branch.slug, stay, lines)}
          />
        }
        selection={{ branchSlug: branch.slug, stay, lines }}
        // Plain objects: money values cannot cross to the browser as classes.
        services={setup.services.map(({ kind, unit, price, childPrice }) => ({
          kind,
          unit,
          price: money(price),
          childPrice: childPrice && money(childPrice),
        }))}
        maxVehicles={setup.maxVehicles}
        times={times}
        price={{
          quote: displayQuote(quote),
          paymentMethods: [...paymentMethods],
        }}
        terms={{
          branchName: branch.name,
          deadlineLabel,
          timeZone: setup.timeZone,
          insideWindow: !CancellationDeadline.isOpen(deadline, new Date()),
          consentVersions: setup.consentVersions,
        }}
        countries={phoneCountries()}
        channels={channels}
        lifetimes={{ codeLifetimeMs, tokenLifetimeMs }}
        contact={contact}
      />
    </BookingSearchFrame>
  );
}
