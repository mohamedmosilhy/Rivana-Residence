import type { Metadata, Route } from "next";
import Link from "next/link";

import { pageCount } from "@/application/shared/pagination";
import { getCurrentStaff, requireStaff } from "@/composition/auth";
import { propertyTimeZone, facilityQueries } from "@/composition/content";
import { CatalogTable } from "@/presentation/admin/content/catalog-table";
import { catalogFilters } from "@/presentation/admin/content/catalog-filters";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { ListFilters, Pagination } from "@/presentation/admin/ui/list-controls";
import { Notice, noticeFrom } from "@/presentation/admin/ui/notice";
import { PageHeader } from "@/presentation/admin/ui/page-header";
import { EmptyState } from "@/presentation/admin/ui/states";

import { moveFacilityAction } from "./actions";

export const metadata: Metadata = { title: "Facilities" };

type FacilitiesPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function FacilitiesPage({
  searchParams,
}: FacilitiesPageProps) {
  const { allowed } = await requireStaff("/admin/facilities", "content:edit");
  if (!allowed) return <DeniedPage title="Facilities" />;

  const params = await searchParams;
  const [listing, timeZone] = await Promise.all([
    facilityQueries().list(await getCurrentStaff(), params),
    propertyTimeZone(),
  ]);
  if (!listing.ok) throw new Error("Facilities are unavailable.");
  const { items, total, page, pageSize, query, reorderable, activeOrder } =
    listing.value;
  const filtered = Boolean(
    query.search || query.status || query.featured !== null,
  );

  const hrefFor = (target: number) => {
    const search = new URLSearchParams();
    if (query.search) search.set("q", query.search);
    if (query.status) search.set("status", query.status);
    if (query.featured !== null)
      search.set("featured", query.featured ? "yes" : "no");
    if (target > 1) search.set("page", String(target));
    const value = search.toString();
    return `/admin/facilities${value ? `?${value}` : ""}` as Route;
  };

  return (
    <>
      <PageHeader
        title="Facilities"
        description={
          <p>
            Facilities such as the pool, cafe, and spa, in display order. Only
            published facilities are public.
          </p>
        }
        actions={
          <Link href="/admin/facilities/new" className="admin-button">
            Add facility
          </Link>
        }
      />
      <Notice code={noticeFrom(params.notice)} />
      <ListFilters
        action="/admin/facilities"
        searchLabel="Search name or web address"
        search={query.search}
        filters={catalogFilters(query)}
      />
      {items.length > 0 ? (
        <>
          <CatalogTable
            caption="Facilities"
            basePath="/admin/facilities"
            rows={items}
            timeZone={timeZone}
            {...(reorderable
              ? {
                  ordering: {
                    activeOrder,
                    move: (id: string, offset: -1 | 1) =>
                      moveFacilityAction.bind(null, id, offset),
                  },
                }
              : {})}
          />
          {!reorderable ? (
            <p className="admin-muted admin-list-note">
              Clear the filters to change the display order.
            </p>
          ) : null}
        </>
      ) : filtered ? (
        <EmptyState title="No facilities match these filters">
          <p>Try a different search or filter, or clear the filters.</p>
        </EmptyState>
      ) : (
        <EmptyState
          title="No facilities yet"
          action={
            <Link href="/admin/facilities/new" className="admin-button">
              Add facility
            </Link>
          }
        >
          <p>
            Add each facility once. It stays a private draft until you publish
            it.
          </p>
        </EmptyState>
      )}
      <Pagination
        page={page}
        pageCount={pageCount(total, pageSize)}
        total={total}
        pageSize={pageSize}
        hrefFor={hrefFor}
        itemLabel="facilities"
      />
    </>
  );
}
