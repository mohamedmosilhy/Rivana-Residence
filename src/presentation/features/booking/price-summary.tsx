import type { Route } from "next";
import Link from "next/link";

import { formatMoney } from "@/presentation/format/money";
import { bookingPanel, link } from "@/presentation/site/classes";

import { displayNight } from "./display-date";
import { serviceName } from "./extras-answer";
import type { Quote } from "./extras-state";
import { count, PriceRow, vatLabel } from "./price-row";
import { StayDates, type StayTimes } from "./stay-dates";

/**
 * The server's price, line by line (PR-7): every amount is shown as it came.
 * While it does not answer the current choices, the figures are hidden.
 */
export function PriceSummary({
  quote,
  times,
  stale,
  changeHref,
  nightly = false,
  allowChange = true,
}: Readonly<{
  quote: Quote;
  times: StayTimes;
  /** Why the held figures are not current; null when they are. */
  stale: string | null;
  changeHref: string;
  nightly?: boolean;
  allowChange?: boolean;
}>) {
  const nights = quote.lines[0]?.nights.length ?? 0;
  return (
    <aside
      aria-labelledby="stay-summary"
      className={`${bookingPanel} grid min-w-0 content-start gap-4`}
    >
      <h2
        id="stay-summary"
        className="m-0 font-display text-heading-md text-plum-900"
      >
        Your stay
      </h2>
      <dl className="m-0 grid gap-3">
        <StayDates stay={quote.stay} times={times} />
      </dl>
      <p className="m-0 text-small text-neutral-800">
        {count(nights, "night", "nights")}
      </p>
      <div className="relative min-w-0">
        <QuoteTable
          quote={quote}
          nightly={nightly}
          caption="Price of your stay"
          className={stale ? "invisible" : ""}
        />
        {stale && (
          <p className="absolute inset-0 m-0 grid place-content-center text-center text-neutral-800">
            {stale}
          </p>
        )}
      </div>
      {allowChange && (
        <Link
          href={changeHref as Route}
          prefetch={false}
          className={`${link} justify-self-start`}
        >
          Change selection
        </Link>
      )}
    </aside>
  );
}

/** One server quote as a price table, every amount shown as it came. */
export function QuoteTable({
  quote,
  caption,
  nightly = false,
  className = "",
}: Readonly<{
  quote: Quote;
  /** Names the table for screen readers. */
  caption: string;
  nightly?: boolean;
  className?: string;
}>) {
  const { coupon } = quote;
  return (
    <table
      className={`w-full border-collapse border-t border-neutral-300 text-neutral-950 ${className}`}
    >
      <caption className="sr-only">{caption}</caption>
      <tbody>
        {quote.lines.map((line, index) => (
          <PriceRow
            key={index}
            label={line.roomName}
            note={
              <>
                {count(line.occupancy.adults, "adult", "adults")},{" "}
                {count(line.occupancy.children, "child", "children")}
                {nightly && (
                  <span className="mt-2 grid gap-1 border-l border-gold-rule pl-3 tabular-nums">
                    {line.nights.map((night) => (
                      <span key={night.night}>
                        {displayNight({ value: night.night })}
                        {night.label && ` (${night.label})`} ·{" "}
                        {formatMoney(night.amount)}
                      </span>
                    ))}
                  </span>
                )}
              </>
            }
            amount={formatMoney(line.accommodation)}
          />
        ))}
        {quote.services.map((service) => (
          <PriceRow
            key={service.kind}
            label={serviceName[service.kind]}
            note={
              service.vehicles === null
                ? undefined
                : count(service.vehicles, "car", "cars")
            }
            amount={formatMoney(service.amount)}
          />
        ))}
        <PriceRow label="Subtotal" amount={formatMoney(quote.subtotal)} />
        {coupon && (
          <PriceRow
            label="Discount"
            note={`Code ${coupon.code}`}
            amount={`−${formatMoney(quote.discount)}`}
          />
        )}
        <PriceRow
          label={vatLabel(quote.vatRateBasisPoints)}
          amount={formatMoney(quote.vat)}
        />
        <PriceRow label="Total" amount={formatMoney(quote.total)} strong />
      </tbody>
    </table>
  );
}
