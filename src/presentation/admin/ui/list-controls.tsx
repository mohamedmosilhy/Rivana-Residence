import type { Route } from "next";
import Link from "next/link";
import {
  button,
  control,
  fieldLabel,
  link,
} from "@/presentation/admin/ui/classes";

const FILTER_FIELD = "grid min-w-[min(100%,14rem)] content-start gap-2";
const PAGE_LINK =
  "inline-block px-3 py-2 text-plum-700 underline underline-offset-[0.2em]";

type FilterOption = Readonly<{ value: string; label: string }>;

type Filter = Readonly<{
  name: string;
  label: string;
  value: string | null;
  options: readonly FilterOption[];
  /** Label of the empty choice; defaults to "All". */
  allLabel?: string;
}>;

type ListFiltersProps = Readonly<{
  action: Route;
  searchLabel: string;
  search: string | null;
  filters: readonly Filter[];
}>;

// A plain GET form: filters live in the URL, work without JavaScript, and
// survive reloads and shared links. Changing a filter returns to page 1.
export function ListFilters({
  action,
  searchLabel,
  search,
  filters,
}: ListFiltersProps) {
  const active = Boolean(search || filters.some((filter) => filter.value));
  return (
    <form
      className="mb-5 flex flex-wrap items-end gap-4"
      action={action}
      role="search"
    >
      <div className={`${FILTER_FIELD} flex-[1_1_14rem]`}>
        <label htmlFor="list-search" className={fieldLabel}>
          {searchLabel}
        </label>
        <input
          id="list-search"
          name="q"
          type="search"
          defaultValue={search ?? ""}
          maxLength={100}
          className={control}
        />
      </div>
      {filters.map((filter) => (
        <div className={`${FILTER_FIELD} flex-[0_1_12rem]`} key={filter.name}>
          <label htmlFor={`list-filter-${filter.name}`} className={fieldLabel}>
            {filter.label}
          </label>
          <select
            id={`list-filter-${filter.name}`}
            name={filter.name}
            defaultValue={filter.value ?? ""}
            className={control}
          >
            <option value="">{filter.allLabel ?? "All"}</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      <div className="flex items-center gap-4">
        <button type="submit" className={button("secondary")}>
          Apply filters
        </button>
        {active ? (
          <Link href={action} className={link}>
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
    <nav
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[0.875rem] text-neutral-600"
      aria-label="Pagination"
    >
      <p className="m-0">
        {total === 0
          ? `No ${itemLabel}`
          : `Showing ${first}–${last} of ${total} ${itemLabel}`}
      </p>
      {pageCount > 1 ? (
        <ul className="flex items-center gap-4">
          <li>
            {page > 1 ? (
              <Link href={hrefFor(page - 1)} rel="prev" className={PAGE_LINK}>
                Previous<span className="visually-hidden"> page</span>
              </Link>
            ) : (
              <span aria-disabled="true" className="px-3 py-2 opacity-55">
                Previous
              </span>
            )}
          </li>
          <li aria-current="page">
            Page {page} of {pageCount}
          </li>
          <li>
            {page < pageCount ? (
              <Link href={hrefFor(page + 1)} rel="next" className={PAGE_LINK}>
                Next<span className="visually-hidden"> page</span>
              </Link>
            ) : (
              <span aria-disabled="true" className="px-3 py-2 opacity-55">
                Next
              </span>
            )}
          </li>
        </ul>
      ) : null}
    </nav>
  );
}
