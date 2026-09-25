import type { ReactNode } from "react";

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
    <div
      className="admin-table-wrap"
      role="region"
      aria-label={caption}
      tabIndex={0}
    >
      <table className="admin-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th scope="col" key={column.header}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => {
                const className = column.wrap ? "admin-table__wrap" : undefined;
                return column.rowHeader ? (
                  <th scope="row" key={column.header} className={className}>
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
