import type { ContactEnquiryDto } from "@/application/ports/repositories";
import { formatDateTime } from "@/presentation/admin/format";
import { EnquiryBadge } from "@/presentation/admin/ui/badge";
import { DataTable } from "@/presentation/admin/ui/data-table";

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
              <span className="admin-table__primary">{enquiry.name}</span>
              <span className="admin-table__secondary">{enquiry.email}</span>
            </>
          ),
        },
        {
          header: "Subject",
          wrap: true,
          cell: (enquiry) => (
            <>
              <span className="admin-table__primary">
                {enquiry.subject ?? "No subject"}
              </span>
              <span className="admin-table__secondary">
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
