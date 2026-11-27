"use client";

import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  createContext,
  use,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { QuoteInput } from "@/presentation/api-client/quotes";
import type { ApiProblem } from "@/presentation/api-client/result";
import { formatMoney } from "@/presentation/format/money";
import { button, link } from "@/presentation/site/classes";

import {
  bookingDetailsHref,
  decodeSelection,
  encodeSelection,
  type SelectionLine,
} from "./selection-link";
import { useDebouncedQuote } from "./selection-quote";

type Line = QuoteInput["lines"][number];
type Counts = Line["occupancy"];
type Listing = Readonly<{
  slug: string;
  name: string;
  unitsAvailable: number;
  maxAdults: number;
  maxChildren: number;
}>;
type SelectedUnit = Readonly<{
  id: number;
  listing: Listing;
  occupancy: Counts;
}>;

const SelectionContext = createContext<{
  units: readonly SelectedUnit[];
  limit: number;
  add: (listing: Listing) => void;
} | null>(null);

function listingSelection(
  units: readonly SelectedUnit[],
  limit: number,
  listing: Listing,
) {
  const count = units.filter(
    (unit) => unit.listing.slug === listing.slug,
  ).length;
  if (count >= listing.unitsAvailable) {
    const unit = listing.unitsAvailable === 1 ? "unit" : "units";
    return {
      count,
      limitMessage: `All ${listing.unitsAvailable} available ${unit} selected.`,
    };
  }
  return {
    count,
    limitMessage:
      units.length >= limit ? `Maximum ${limit} units per booking.` : null,
  };
}

/**
 * The units named by the address's `u` value, as far as these results can
 * still hold them. Without one, as after a new search, the basket is empty.
 */
function restoreUnits(
  value: string | null,
  listings: readonly Listing[],
  limit: number,
) {
  const units: SelectedUnit[] = [];
  for (const line of (value && decodeSelection(value)) || []) {
    const listing = listings.find(({ slug }) => slug === line.roomSlug);
    if (!listing || listingSelection(units, limit, listing).limitMessage)
      continue;
    const { adults, children } = line.occupancy;
    units.push({
      id: units.length + 1,
      listing,
      occupancy: {
        adults: Math.max(1, Math.min(adults, listing.maxAdults)),
        children: Math.min(children, listing.maxChildren),
      },
    });
  }
  return units;
}

/** So that going back from the details page rebuilds this basket. */
function rememberSelection(lines: readonly SelectionLine[]) {
  const url = new URL(window.location.href);
  url.searchParams.set("u", encodeSelection(lines));
  url.searchParams.delete("notice");
  window.history.replaceState(null, "", url);
}

export function AddBookingUnit({ listing }: Readonly<{ listing: Listing }>) {
  const selection = use(SelectionContext);
  if (!selection) return null;
  const { count, limitMessage } = listingSelection(
    selection.units,
    selection.limit,
    listing,
  );
  const reasonId = `selection-limit-${listing.slug}`;

  return (
    <div className="grid gap-2">
      <button
        type="button"
        aria-label={`Add to stay: ${listing.name}`}
        aria-disabled={limitMessage ? true : undefined}
        aria-describedby={limitMessage ? reasonId : undefined}
        className={button(
          "ghost",
          "justify-self-start aria-disabled:opacity-70",
        )}
        onClick={() => selection.add(listing)}
      >
        Add to stay
      </button>
      {count > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 text-small text-neutral-600">
          <span>{count} selected</span>
          <a href="#booking-selection" className={link}>
            View selection
          </a>
        </div>
      )}
      {limitMessage && (
        <p id={reasonId} className="m-0 text-small text-neutral-600">
          {limitMessage}
        </p>
      )}
    </div>
  );
}

function GuestCount({
  label,
  min,
  max,
  value,
  onChange,
}: Readonly<{
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}>) {
  return (
    <label className="grid min-w-0 gap-1 text-small font-medium text-plum-900">
      {label}
      <span className="relative min-w-0">
        <select
          value={value}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          className="h-11 w-full min-w-0 appearance-none rounded-none border border-control-border bg-surface pr-8 pl-2 text-base text-neutral-950"
        >
          {Array.from(
            { length: max - min + 1 },
            (_, offset) => min + offset,
          ).map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-2 -translate-y-3/4 rotate-45 border-r border-b border-current"
        />
      </span>
    </label>
  );
}

function quoteError(problem: ApiProblem) {
  if (problem.code === "RATE_LIMITED") {
    return `Too many price checks. Try again in ${problem.retryAfter ?? 60} seconds.`;
  }
  if (problem.code === "VALIDATION") {
    return "Check the dates and guests in your selection, then try again.";
  }
  return "We couldn’t check the price. Please try again.";
}

export function BookingSelection({
  branchSlug,
  stay,
  initialOccupancy,
  limit,
  listings,
  children,
}: Readonly<{
  branchSlug: string;
  stay: QuoteInput["stay"];
  initialOccupancy: Counts;
  limit: number;
  listings: readonly Listing[];
  children: ReactNode;
}>) {
  const remembered = useSearchParams()?.get("u") ?? null;
  const [units, setUnits] = useState<readonly SelectedUnit[]>(() =>
    restoreUnits(remembered, listings, limit),
  );
  const nextId = useRef(units.length);
  const heading = useRef<HTMLHeadingElement>(null);
  const lines = useMemo(
    () =>
      units.map(({ listing, occupancy }) => ({
        roomSlug: listing.slug,
        occupancy,
      })),
    [units],
  );
  const { checkIn, checkOut } = stay;
  const request = useMemo(
    () =>
      lines.length === 0
        ? null
        : { branchSlug, stay: { checkIn, checkOut }, lines, services: [] },
    [branchSlug, checkIn, checkOut, lines],
  );
  const { result, retry } = useDebouncedQuote(request);
  const data = result?.ok ? result.data : null;
  const problem = result?.ok === false ? result.problem : null;
  const quote = data?.available ? data.quote : null;
  const canContinue = data?.bookable && quote !== null;
  const unavailable = data?.available === false;
  const closed = data?.available && !data.bookable;
  const retryable = problem !== null || unavailable;

  function add(listing: Listing) {
    const id = ++nextId.current;
    setUnits((current) =>
      listingSelection(current, limit, listing).limitMessage
        ? current
        : [
            ...current,
            {
              id,
              listing,
              occupancy: {
                adults: Math.min(initialOccupancy.adults, listing.maxAdults),
                children: Math.min(
                  initialOccupancy.children,
                  listing.maxChildren,
                ),
              },
            },
          ],
    );
  }

  function setGuests(id: number, field: keyof Counts, value: number) {
    setUnits((current) =>
      current.map((unit) =>
        unit.id === id
          ? { ...unit, occupancy: { ...unit.occupancy, [field]: value } }
          : unit,
      ),
    );
  }

  return (
    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.48fr)]">
      <SelectionContext value={{ units, limit, add }}>
        {children}
      </SelectionContext>
      <section
        aria-labelledby="booking-selection"
        className="grid min-w-0 gap-4 border border-neutral-300 bg-surface p-4 sm:p-6"
      >
        <h3
          id="booking-selection"
          ref={heading}
          tabIndex={-1}
          className="m-0 scroll-mt-24 font-display text-heading-lg leading-tight text-plum-900"
        >
          Your selection
        </h3>
        <noscript>
          <p className="m-0 text-small">
            Enable JavaScript to select rooms or apartments.
          </p>
        </noscript>
        {units.length > 0 && (
          <ol className="m-0 grid list-none gap-4 p-0">
            {units.map(({ id, listing, occupancy }, index) => {
              const label = `${listing.name} · Unit ${index + 1}`;
              const matchingUnits = units.filter(
                (unit) => unit.listing.slug === listing.slug,
              );
              // P6 marks every line of a listing when their combined quantity fails.
              const changed =
                data?.unavailableLines.includes(index) &&
                matchingUnits[0]?.id === id;
              const linePath = `lines.${index}`;
              const errors = Object.entries(problem?.fieldErrors ?? {}).flatMap(
                ([field, messages]) =>
                  field === linePath || field.startsWith(`${linePath}.`)
                    ? messages
                    : [],
              );
              const descriptionId =
                changed || errors.length > 0
                  ? `booking-unit-${id}-message`
                  : undefined;
              return (
                <li
                  key={id}
                  className="min-w-0 border-b border-neutral-300 pb-3"
                >
                  <fieldset
                    aria-describedby={descriptionId}
                    className="m-0 grid min-w-0 grid-cols-2 gap-3 border-0 p-0"
                  >
                    <legend className="mb-2 p-0 font-medium break-words text-plum-900">
                      {label}
                    </legend>
                    <GuestCount
                      label="Adults"
                      min={1}
                      max={listing.maxAdults}
                      value={occupancy.adults}
                      onChange={(value) => setGuests(id, "adults", value)}
                    />
                    <GuestCount
                      label="Children"
                      min={0}
                      max={listing.maxChildren}
                      value={occupancy.children}
                      onChange={(value) => setGuests(id, "children", value)}
                    />
                    {descriptionId && (
                      <p
                        id={descriptionId}
                        className="col-span-2 m-0 text-small text-danger"
                      >
                        {changed
                          ? matchingUnits.length > 1
                            ? "The full quantity is unavailable. Try removing a unit of this type."
                            : "This listing is unavailable for these dates."
                          : errors.join(" ")}
                      </p>
                    )}
                  </fieldset>
                  <button
                    type="button"
                    aria-label={`Remove ${listing.name}, unit ${index + 1}`}
                    className={`${link} min-w-11`}
                    onClick={() => {
                      heading.current?.focus();
                      setUnits((current) =>
                        current.filter((unit) => unit.id !== id),
                      );
                    }}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        <div role="status" className="grid gap-2 text-small text-neutral-800">
          {units.length === 0 ? (
            <p className="m-0">
              Choose up to {limit} rooms or apartments for this stay.
            </p>
          ) : (
            <>
              <p className="m-0">
                {units.length} of {limit} units selected
              </p>
              {problem && (
                <p className="m-0 text-danger">{quoteError(problem)}</p>
              )}
              {unavailable && (
                <p className="m-0 text-danger">
                  Availability changed. Adjust your selection or check again.
                </p>
              )}
              {closed && (
                <p className="m-0">
                  Online booking is unavailable. Please contact the hotel.
                </p>
              )}
              {!result && (
                <p className="m-0">Checking availability and price…</p>
              )}
              {quote && (
                <dl className="m-0 grid gap-1">
                  <dt>Accommodation subtotal before VAT</dt>
                  <dd className="m-0 font-display text-heading-lg leading-tight text-plum-900">
                    {formatMoney(quote.accommodation)}
                  </dd>
                </dl>
              )}
            </>
          )}
        </div>
        {retryable && (
          <button
            type="button"
            className={button("ghost", "w-full")}
            onClick={() => {
              heading.current?.focus();
              retry();
            }}
          >
            Check again
          </button>
        )}
        {canContinue && (
          <Link
            href={bookingDetailsHref(branchSlug, stay, lines) as Route}
            prefetch={false}
            className={button("primary", "w-full")}
            onClick={() => rememberSelection(lines)}
          >
            Continue
          </Link>
        )}
      </section>
    </div>
  );
}
