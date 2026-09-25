import type { Metadata, Route } from "next";
import Link from "next/link";

import { pageCount } from "@/application/shared/pagination";
import { getCurrentStaff, requireStaff } from "@/composition/auth";
import { propertyTimeZone, roomQueries } from "@/composition/content";
import { CatalogTable } from "@/presentation/admin/content/catalog-table";
import { catalogFilters } from "@/presentation/admin/content/catalog-filters";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { ListFilters, Pagination } from "@/presentation/admin/ui/list-controls";
import { Notice, noticeFrom } from "@/presentation/admin/ui/notice";
import { PageHeader } from "@/presentation/admin/ui/page-header";
import { EmptyState } from "@/presentation/admin/ui/states";

import { moveRoomAction } from "./actions";

export const metadata: Metadata = { title: "Rooms" };

type RoomsPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function RoomsPage({ searchParams }: RoomsPageProps) {
  const { allowed } = await requireStaff("/admin/rooms", "content:edit");
  if (!allowed) return <DeniedPage title="Rooms" />;

  const params = await searchParams;
  const [listing, timeZone] = await Promise.all([
    roomQueries().list(await getCurrentStaff(), params),
    propertyTimeZone(),
  ]);
  if (!listing.ok) throw new Error("Rooms are unavailable.");
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
    return `/admin/rooms${value ? `?${value}` : ""}` as Route;
  };

  return (
    <>
      <PageHeader
        title="Rooms"
        description={
          <p>
            Room types shown on the website, in display order. Only published
            rooms are public.
          </p>
        }
        actions={
          <Link href="/admin/rooms/new" className="admin-button">
            Add room
          </Link>
        }
      />
      <Notice code={noticeFrom(params.notice)} />
      <ListFilters
        action="/admin/rooms"
        searchLabel="Search name or web address"
        search={query.search}
        filters={catalogFilters(query)}
      />
      {items.length > 0 ? (
        <>
          <CatalogTable
            caption="Rooms"
            basePath="/admin/rooms"
            rows={items}
            timeZone={timeZone}
            {...(reorderable
              ? {
                  ordering: {
                    activeOrder,
                    move: (id: string, offset: -1 | 1) =>
                      moveRoomAction.bind(null, id, offset),
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
        <EmptyState title="No rooms match these filters">
          <p>Try a different search or filter, or clear the filters.</p>
        </EmptyState>
      ) : (
        <EmptyState
          title="No rooms yet"
          action={
            <Link href="/admin/rooms/new" className="admin-button">
              Add room
            </Link>
          }
        >
          <p>
            Add each room type once. It stays a private draft until you publish
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
        itemLabel="rooms"
      />
    </>
  );
}
