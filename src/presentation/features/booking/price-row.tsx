import type { ReactNode } from "react";

import { bookingSubheading, figures } from "@/presentation/site/classes";

export const count = (value: number, one: string, many: string) =>
  `${value} ${value === 1 ? one : many}`;

const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});

export const vatLabel = (basisPoints: number) =>
  `VAT (${percent.format(basisPoints / 10_000)})`;

/** One line of a price table: what it is, and the server's amount for it. */
export function PriceRow({
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
        className={`py-2.5 pr-3 text-left wrap-break-word ${strong ? bookingSubheading : "font-normal"}`}
      >
        {label}
        {note && (
          <span className="block text-small font-normal text-neutral-600">
            {note}
          </span>
        )}
      </th>
      <td
        className={`py-2.5 text-right whitespace-nowrap tabular-nums ${strong ? `${figures} text-heading-md` : ""}`}
      >
        {amount}
      </td>
    </tr>
  );
}
