import type { ReactNode } from "react";
import { tableWrap } from "@/presentation/admin/ui/classes";

const CELL = "border-b border-neutral-300 px-4 py-3 text-left align-top";

export type Column<Row> = Readonly<{
  header: string;
  cell: (row: Row) => ReactNode;
  /** The column that names each row; rendered as a row header. */
  rowHeader?: boolean;
  /** Allow long text to wrap instead of scrolling horizontally. */
  wrap?: boolean;
}>;

type DataTableProps<Row> = Readonly<{
  caption: string;
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
}>;

// A semantic table inside a focusable scroll container, so keyboard users can
// scroll wide tables at 200% zoom and on small screens.
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
}: DataTableProps<Row>) {
  return (
    <div className={tableWrap} role="region" aria-label={caption} tabIndex={0}>
      <table className="w-full border-collapse text-[0.9375rem] text-neutral-800">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                scope="col"
                key={column.header}
                className={`${CELL} bg-admin-canvas text-[0.8125rem] font-medium whitespace-nowrap text-neutral-600`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="last:*:border-b-0">
              {columns.map((column) => {
                const className = column.wrap
                  ? `${CELL} min-w-[16rem] whitespace-normal`
                  : `${CELL} whitespace-nowrap`;
                return column.rowHeader ? (
                  <th
                    scope="row"
                    key={column.header}
                    className={`${className} font-medium`}
                  >
                    {column.cell(row)}
                  </th>
                ) : (
                  <td key={column.header} className={className}>
                    {column.cell(row)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
