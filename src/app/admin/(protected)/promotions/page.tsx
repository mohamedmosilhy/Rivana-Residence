import type { Metadata, Route } from "next";
import Link from "next/link";

import { promotionTiming } from "@/application/promotions/promotion-admin";
import { pageCount } from "@/application/shared/pagination";
import { getCurrentStaff, requireStaff } from "@/composition/auth";
import { promotionAdmin, propertyTimeZone } from "@/composition/content";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { formatDateTime } from "@/presentation/admin/format";
import { Badge, PublicationBadge } from "@/presentation/admin/ui/badge";
import { DataTable } from "@/presentation/admin/ui/data-table";
import { ListFilters, Pagination } from "@/presentation/admin/ui/list-controls";
import { Notice, noticeFrom } from "@/presentation/admin/ui/notice";
import { PageHeader } from "@/presentation/admin/ui/page-header";
import { EmptyState } from "@/presentation/admin/ui/states";

export const metadata: Metadata = { title: "Promotions" };

const TIMING_LABELS = {
  active: "In its window",
  scheduled: "Scheduled",
  expired: "Expired",
} as const;

type PromotionsPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function PromotionsPage({
  searchParams,
}: PromotionsPageProps) {
  const { allowed } = await requireStaff(
    "/admin/promotions",
    "promotions:manage",
  );
  if (!allowed) return <DeniedPage title="Promotions" />;

  const params = await searchParams;
  const [listing, timeZone] = await Promise.all([
    promotionAdmin().list(await getCurrentStaff(), params),
    propertyTimeZone(),
  ]);
  if (!listing.ok) throw new Error("Promotions are unavailable.");
  const { items, total, page, pageSize, query, now } = listing.value;
  const filtered = Boolean(query.search || query.status || query.timing);
  const when = (date: Date | null, fallback: string) =>
    date ? formatDateTime(date, timeZone) : fallback;

  const hrefFor = (target: number) => {
    const search = new URLSearchParams();
    if (query.search) search.set("q", query.search);
    if (query.status) search.set("status", query.status);
    if (query.timing) search.set("timing", query.timing);
    if (target > 1) search.set("page", String(target));
    const value = search.toString();
    return `/admin/promotions${value ? `?${value}` : ""}` as Route;
  };

  return (
    <>
      <PageHeader
        title="Promotions"
        description={
          <p>
            Pop-up campaigns with a promotion code. At most one shows at a time.
            Times are in {timeZone}.
          </p>
        }
        actions={
          <Link href="/admin/promotions/new" className="admin-button">
            Add promotion
          </Link>
        }
      />
      <Notice code={noticeFrom(params.notice)} />
      <ListFilters
        action="/admin/promotions"
        searchLabel="Search name, headline, or code"
        search={query.search}
        filters={[
          {
            name: "status",
            label: "Status",
            value: query.status,
            allLabel: "Draft and published",
            options: [
              { value: "DRAFT", label: "Draft" },
              { value: "PUBLISHED", label: "Published" },
              { value: "ARCHIVED", label: "Archived" },
            ],
          },
          {
            name: "timing",
            label: "Timing",
            value: query.timing,
            allLabel: "Any time",
            options: Object.entries(TIMING_LABELS).map(([value, label]) => ({
              value,
              label,
            })),
          },
        ]}
      />
      {items.length > 0 ? (
        <DataTable
          caption="Promotions"
          rows={items}
          rowKey={(promotion) => promotion.id}
          columns={[
            {
              header: "Internal name",
              rowHeader: true,
              cell: (promotion) => (
                <>
                  <Link
                    href={`/admin/promotions/${promotion.id}` as Route}
                    className="admin-table__primary admin-link"
                  >
                    {promotion.internalName}
                  </Link>
                  <span className="admin-table__secondary">
                    {promotion.headline}
                  </span>
                </>
              ),
            },
            {
              header: "Code",
              cell: (promotion) => <code>{promotion.code}</code>,
            },
            {
              header: "Status",
              cell: (promotion) => (
                <span className="admin-badges">
                  <PublicationBadge status={promotion.status} />
                  {promotion.status !== "ARCHIVED" ? (
                    <Badge>
                      {TIMING_LABELS[promotionTiming(promotion, now)]}
                    </Badge>
                  ) : null}
                  {promotion.showAsPopup ? null : <Badge>Pop-up off</Badge>}
                </span>
              ),
            },
            {
              header: "Window",
              wrap: true,
              cell: (promotion) =>
                `${when(promotion.startsAt, "Now")} → ${when(promotion.endsAt, "No end")}`,
            },
            { header: "Priority", cell: (promotion) => promotion.priority },
            {
              header: "Updated",
              cell: (promotion) =>
                formatDateTime(promotion.updatedAt, timeZone),
            },
          ]}
        />
      ) : filtered ? (
        <EmptyState title="No promotions match these filters">
          <p>Try a different search or filter, or clear the filters.</p>
        </EmptyState>
      ) : (
        <EmptyState
          title="No promotions yet"
          action={
            <Link href="/admin/promotions/new" className="admin-button">
              Add promotion
            </Link>
          }
        >
          <p>
            A promotion shows a headline and a code in a pop-up on the website.
          </p>
        </EmptyState>
      )}
      <Pagination
        page={page}
        pageCount={pageCount(total, pageSize)}
        total={total}
        pageSize={pageSize}
        hrefFor={hrefFor}
        itemLabel="promotions"
      />
    </>
  );
}
