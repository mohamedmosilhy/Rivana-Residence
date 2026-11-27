import type { Metadata, Route } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  getBookingSetup,
  quoteBookingDetails,
} from "@/composition/booking-details";
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
  return (
    <BookingSearchFrame branch={branch} title="Your booking">
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.48fr)]">
        <div className="min-w-0 lg:order-2">
          <SelectionSummary
            quote={quote}
            changeHref={bookingResultsHref(branch.slug, stay, lines)}
          />
        </div>
        <BookingJourney
          // A changed selection starts its own verification.
          key={bookingDetailsHref(branch.slug, stay, lines)}
          countries={phoneCountries()}
          channels={channels}
          lifetimes={{ codeLifetimeMs, tokenLifetimeMs }}
          contact={contact}
        />
      </div>
    </BookingSearchFrame>
  );
}
