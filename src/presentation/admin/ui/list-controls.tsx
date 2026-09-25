import type { Route } from "next";
import Link from "next/link";

type FilterOption = Readonly<{ value: string; label: string }>;

type ListFiltersProps = Readonly<{
  action: Route;
  searchLabel: string;
  search: string | null;
  filter: Readonly<{
    name: string;
    label: string;
    value: string | null;
    options: readonly FilterOption[];
  }>;
}>;

// A plain GET form: filters live in the URL, work without JavaScript, and
// survive reloads and shared links. Changing a filter returns to page 1.
export function ListFilters({
  action,
  searchLabel,
  search,
  filter,
}: ListFiltersProps) {
  const active = Boolean(search || filter.value);
  return (
    <form className="admin-filters" action={action} role="search">
      <div className="admin-field">
        <label htmlFor="list-search">{searchLabel}</label>
        <input
          id="list-search"
          name="q"
          type="search"
          defaultValue={search ?? ""}
          maxLength={100}
        />
      </div>
      <div className="admin-field">
        <label htmlFor="list-filter">{filter.label}</label>
        <select
          id="list-filter"
          name={filter.name}
          defaultValue={filter.value ?? ""}
        >
          <option value="">All</option>
          {filter.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="admin-filters__actions">
        <button type="submit" className="admin-button admin-button--secondary">
          Apply filters
        </button>
        {active ? (
          <Link href={action} className="admin-link">
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}

type PaginationProps = Readonly<{
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  /** Builds the URL for a page while keeping the current filters. */
  hrefFor: (page: number) => Route;
  itemLabel: string;
}>;

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  hrefFor,
  itemLabel,
}: PaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav className="admin-pagination" aria-label="Pagination">
      <p className="admin-pagination__summary">
        {total === 0
          ? `No ${itemLabel}`
          : `Showing ${first}–${last} of ${total} ${itemLabel}`}
      </p>
      {pageCount > 1 ? (
        <ul>
          <li>
            {page > 1 ? (
              <Link href={hrefFor(page - 1)} rel="prev">
                Previous<span className="sr-only"> page</span>
              </Link>
            ) : (
              <span aria-disabled="true">Previous</span>
            )}
          </li>
          <li aria-current="page">
            Page {page} of {pageCount}
          </li>
          <li>
            {page < pageCount ? (
              <Link href={hrefFor(page + 1)} rel="next">
                Next<span className="sr-only"> page</span>
              </Link>
            ) : (
              <span aria-disabled="true">Next</span>
            )}
          </li>
        </ul>
      ) : null}
    </nav>
  );
}
