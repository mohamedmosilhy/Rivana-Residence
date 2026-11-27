import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { formatMoney } from "@/presentation/format/money";
import { bookingPanel, link } from "@/presentation/site/classes";

import { displayDate } from "./display-date";
import { serviceName } from "./extras-answer";
import type { Quote } from "./extras-state";

const count = (value: number, one: string, many: string) =>
  `${value} ${value === 1 ? one : many}`;

const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});

function Row({
  label,
  note,
  amount,
  strong = false,
}: Readonly<{
  label: string;
  note?: ReactNode;
  amount: string;
  strong?: boolean;
}>) {
  return (
    <tr className="border-b border-neutral-300 align-top">
      <th
        scope="row"
        className={`py-2.5 pr-3 text-left break-words ${strong ? "font-display text-heading-md text-plum-900" : "font-normal"}`}
      >
        {label}
        {note && (
          <span className="block text-small font-normal text-neutral-600">
            {note}
          </span>
        )}
      </th>
      <td
        className={`py-2.5 text-right whitespace-nowrap tabular-nums ${strong ? "font-display text-heading-md text-plum-900" : ""}`}
      >
        {amount}
      </td>
    </tr>
  );
}

/**
 * The server's price, line by line (PR-7): every amount is shown as it came.
 * While it does not answer the current choices, the figures are hidden.
 */
export function PriceSummary({
  quote,
  stale,
  changeHref,
}: Readonly<{
  quote: Quote;
  /** Why the held figures are not current; null when they are. */
  stale: string | null;
  changeHref: string;
}>) {
  const { checkIn, checkOut } = quote.stay;
  const { coupon } = quote;
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
      <p className="m-0 text-small text-neutral-800">
        <time dateTime={checkIn}>{displayDate({ value: checkIn })}</time>
        {" to "}
        <time dateTime={checkOut}>{displayDate({ value: checkOut })}</time>
        <br />
        {count(nights, "night", "nights")}
      </p>
      <div className="relative min-w-0">
        <table
          className={`w-full border-collapse border-t border-neutral-300 text-neutral-950 ${stale ? "invisible" : ""}`}
        >
          <caption className="sr-only">Price of your stay</caption>
          <tbody>
            {quote.lines.map((line, index) => (
              <Row
                key={index}
                label={line.roomName}
                note={`${count(line.occupancy.adults, "adult", "adults")}, ${count(line.occupancy.children, "child", "children")}`}
                amount={formatMoney(line.accommodation)}
              />
            ))}
            {quote.services.map((service) => (
              <Row
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
            <Row label="Subtotal" amount={formatMoney(quote.subtotal)} />
            {coupon && (
              <Row
                label="Discount"
                note={`Code ${coupon.code}`}
                amount={`−${formatMoney(quote.discount)}`}
              />
            )}
            <Row
              label={`VAT (${percent.format(quote.vatRateBasisPoints / 10_000)})`}
              amount={formatMoney(quote.vat)}
            />
            <Row label="Total" amount={formatMoney(quote.total)} strong />
          </tbody>
        </table>
        {stale && (
          <p className="absolute inset-0 m-0 grid place-content-center text-center text-neutral-800">
            {stale}
          </p>
        )}
      </div>
      <Link
        href={changeHref as Route}
        prefetch={false}
        className={`${link} justify-self-start`}
      >
        Change selection
      </Link>
    </aside>
  );
}
