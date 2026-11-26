import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import {
  getBookingSearchSetup,
  searchBookingPage,
} from "@/composition/booking-search";
import { DEFAULT_STAY_POLICY } from "@/domain/shared/stay-policy";
import { AvailabilityResults } from "@/presentation/features/booking/availability-results";
import {
  BookingContact,
  BookingSearchFrame,
  bookingSearchPanel,
} from "@/presentation/features/booking/booking-search-frame";
import {
  SearchFeedback,
  StaySearchForm,
  staySearchFields,
} from "@/presentation/features/booking/stay-search-form";

import {
  pageMetadata,
  requireBranch,
  type BranchParams,
} from "../../site-content";

import { readStaySearchQuery } from "./search-query";

export async function generateMetadata({
  params,
}: BranchParams): Promise<Metadata> {
  const branch = await requireBranch(params);
  return {
    ...(await pageMetadata({
      title: `Find your stay at ${branch.name}`,
      description: branch.summary,
      path: `/${branch.slug}/book`,
      image: branch.hero,
    })),
    robots: { index: false, follow: true },
  };
}

async function runSearch(slug: string, input: unknown) {
  const requestHeaders = await headers();
  try {
    return await searchBookingPage(slug, input, requestHeaders);
  } catch (error) {
    // Driver messages may include query details. Log only the class and code.
    const name = error instanceof Error ? error.name : typeof error;
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string" &&
      /^[A-Z0-9_]{1,32}$/.test(error.code)
        ? error.code
        : "none";
    console.error(
      `[booking-search] availability failed: ${name} (code ${code})`,
    );
    return null;
  }
}

export default async function BookingSearchPage({
  params,
  searchParams,
}: PageProps<"/[branch]/book">) {
  const branch = await requireBranch(params);
  const setup = await getBookingSearchSetup(branch.id);
  if (!setup) notFound();

  if (!setup.bookable) {
    return (
      <BookingSearchFrame branch={branch}>
        <BookingContact
          slug={branch.slug}
          phone={setup.phone}
          email={setup.email}
        />
      </BookingSearchFrame>
    );
  }

  const query = readStaySearchQuery(await searchParams);
  const result = query.input
    ? await runSearch(branch.slug, query.input)
    : undefined;
  const error = result?.ok === false ? result.error : null;
  if (error?.code === "NOT_FOUND") notFound();

  const errors = { ...query.errors };
  if (error?.code === "VALIDATION") {
    for (const field of staySearchFields) {
      const message = error.fieldErrors?.[field]?.[0];
      if (message) errors[field] = message;
    }
  }
  const generalError =
    result === null || (error && Object.keys(errors).length === 0);
  const { bookingHorizonDays, maxStayNights } = DEFAULT_STAY_POLICY;

  return (
    <BookingSearchFrame branch={branch}>
      <div className={bookingSearchPanel}>
        {generalError && (
          <div className="mb-4">
            {error?.code === "RATE_LIMITED" ? (
              <SearchFeedback
                title="Too many searches"
                message={`Please wait ${error.retryAfterSeconds ?? 60} seconds, then search again.`}
              />
            ) : (
              <SearchFeedback
                title="We couldn’t check availability"
                message="Please try your search again in a moment."
              />
            )}
          </div>
        )}
        <StaySearchForm
          action={`/${branch.slug}/book`}
          values={query.values}
          room={query.room}
          errors={errors}
          firstCheckIn={setup.today.value}
          firstCheckOut={setup.today.addDays(1).value}
          lastCheckIn={setup.today.addDays(bookingHorizonDays).value}
          lastCheckOut={
            setup.today.addDays(bookingHorizonDays + maxStayNights).value
          }
        />
      </div>
      {result?.ok && (
        <AvailabilityResults search={result.value} room={query.room} />
      )}
    </BookingSearchFrame>
  );
}
