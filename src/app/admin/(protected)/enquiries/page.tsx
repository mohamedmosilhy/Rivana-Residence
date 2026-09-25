import type { Metadata, Route } from "next";

import { pageCount } from "@/application/shared/pagination";
import { getPublicSiteSettings, listEnquiries } from "@/composition/admin";
import { requireStaff } from "@/composition/auth";
import { ENQUIRY_STATUSES } from "@/domain/shared/types";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { EnquiryTable } from "@/presentation/admin/enquiries/enquiry-table";
import { ENQUIRY_STATUS_LABELS } from "@/presentation/admin/ui/badge";
import { ListFilters, Pagination } from "@/presentation/admin/ui/list-controls";
import { PageHeader } from "@/presentation/admin/ui/page-header";
import { EmptyState } from "@/presentation/admin/ui/states";

export const metadata: Metadata = {
  title: "Enquiries",
};

type EnquiriesPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function EnquiriesPage({
  searchParams,
}: EnquiriesPageProps) {
  const { allowed } = await requireStaff("/admin/enquiries", "enquiries:read");
  if (!allowed) return <DeniedPage title="Enquiries" />;

  const [listing, settings] = await Promise.all([
    listEnquiries(await searchParams),
    getPublicSiteSettings(),
  ]);
  if (!listing.ok) throw new Error("Enquiries are unavailable.");
  const { items, total, page, pageSize, query } = listing.value;
  const filtered = Boolean(query.search || query.status);

  const hrefFor = (target: number) => {
    const params = new URLSearchParams();
    if (query.search) params.set("q", query.search);
    if (query.status) params.set("status", query.status);
    if (target > 1) params.set("page", String(target));
    const search = params.toString();
    return `/admin/enquiries${search ? `?${search}` : ""}` as Route;
  };

  return (
    <>
      <PageHeader
        title="Enquiries"
        description={
          <p>Messages sent through the website contact form, newest first.</p>
        }
      />
      <ListFilters
        action="/admin/enquiries"
        searchLabel="Search name, email, or subject"
        search={query.search}
        filters={[
          {
            name: "status",
            label: "Status",
            value: query.status,
            options: ENQUIRY_STATUSES.map((status) => ({
              value: status,
              label: ENQUIRY_STATUS_LABELS[status],
            })),
          },
        ]}
      />
      {items.length > 0 ? (
        <EnquiryTable
          enquiries={items}
          timeZone={settings?.timeZone ?? "Africa/Cairo"}
        />
      ) : filtered ? (
        <EmptyState title="No enquiries match these filters">
          <p>Try a different search or status, or clear the filters.</p>
        </EmptyState>
      ) : total > 0 ? (
        <EmptyState title="This page is empty">
          <p>There are fewer enquiries than this page number.</p>
        </EmptyState>
      ) : (
        <EmptyState title="No enquiries yet">
          <p>
            Messages from the website contact form will appear here once the
            contact page is live.
          </p>
        </EmptyState>
      )}
      <Pagination
        page={page}
        pageCount={pageCount(total, pageSize)}
        total={total}
        pageSize={pageSize}
        hrefFor={hrefFor}
        itemLabel="enquiries"
      />
    </>
  );
}
