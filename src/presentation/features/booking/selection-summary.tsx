import type { Route } from "next";
import Link from "next/link";

import type { QuoteView } from "@/application/quotes";
import { formatMoney } from "@/presentation/format/money";
import { bookingPanel, figures, link } from "@/presentation/site/classes";

import { displayDate } from "./display-date";

const count = (value: number, one: string, many: string) =>
  `${value} ${value === 1 ? one : many}`;

/** What the guest is booking, as the server just priced it. */
export function SelectionSummary({
  quote,
  changeHref,
}: Readonly<{ quote: QuoteView; changeHref: string }>) {
  const { checkIn, checkOut } = quote.stay;
  const nights = [...quote.stay.nights()].length;
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
        <time dateTime={checkIn.value}>{displayDate(checkIn)}</time>
        {" to "}
        <time dateTime={checkOut.value}>{displayDate(checkOut)}</time>
        <br />
        {count(nights, "night", "nights")}
      </p>
      <ul className="m-0 list-none border-t border-neutral-300 p-0">
        {quote.lines.map((line, index) => (
          <li
            key={index}
            className="grid gap-1 border-b border-neutral-300 py-3"
          >
            <span className="font-medium break-words text-plum-900">
              {line.roomName}
            </span>
            <span className="flex flex-wrap justify-between gap-x-3 text-small text-neutral-600">
              <span>
                {count(line.occupancy.adults, "adult", "adults")},{" "}
                {count(line.occupancy.children, "child", "children")}
              </span>
              <span className="tabular-nums">
                {formatMoney(line.accommodationMinor)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <dl className="m-0 grid gap-1">
        <dt className="text-small">Accommodation subtotal before VAT</dt>
        <dd className={`${figures} m-0 text-heading-lg leading-tight`}>
          {formatMoney(quote.accommodationMinor)}
        </dd>
      </dl>
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
