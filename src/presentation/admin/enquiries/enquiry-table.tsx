import type { ContactEnquiryDto } from "@/application/ports/repositories";
import { formatDateTime } from "@/presentation/admin/format";
import { EnquiryBadge } from "@/presentation/admin/ui/badge";
import { DataTable } from "@/presentation/admin/ui/data-table";
import { tablePrimary, tableSecondary } from "@/presentation/admin/ui/classes";

const PREVIEW_LENGTH = 120;

// Visitor input is rendered as React text only, never as HTML.
export function EnquiryTable({
  enquiries,
  timeZone,
}: Readonly<{ enquiries: readonly ContactEnquiryDto[]; timeZone: string }>) {
  return (
    <DataTable
      caption="Contact enquiries"
      rows={enquiries}
      rowKey={(enquiry) => enquiry.id}
      columns={[
        {
          header: "Received",
          cell: (enquiry) => (
            <time dateTime={enquiry.createdAt.toISOString()}>
              {formatDateTime(enquiry.createdAt, timeZone)}
            </time>
          ),
        },
        {
          header: "From",
          rowHeader: true,
          cell: (enquiry) => (
            <>
              <span className={tablePrimary}>{enquiry.name}</span>
              <span className={tableSecondary}>{enquiry.email}</span>
            </>
          ),
        },
        {
          header: "Subject",
          wrap: true,
          cell: (enquiry) => (
            <>
              <span className={tablePrimary}>
                {enquiry.subject ?? "No subject"}
              </span>
              <span className={tableSecondary}>
                {enquiry.message.length > PREVIEW_LENGTH
                  ? `${enquiry.message.slice(0, PREVIEW_LENGTH)}…`
                  : enquiry.message}
              </span>
            </>
          ),
        },
        {
          header: "Status",
          cell: (enquiry) => <EnquiryBadge status={enquiry.status} />,
        },
      ]}
    />
  );
}
