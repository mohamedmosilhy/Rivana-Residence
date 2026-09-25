import type { Metadata, Route } from "next";
import Link from "next/link";

import { getCurrentStaff, requireStaff } from "@/composition/auth";
import { pageCommands, propertyTimeZone } from "@/composition/content";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { formatDateTime, plural } from "@/presentation/admin/format";
import { Badge } from "@/presentation/admin/ui/badge";
import { DataTable } from "@/presentation/admin/ui/data-table";
import { PageHeader } from "@/presentation/admin/ui/page-header";

export const metadata: Metadata = { title: "Pages" };

export default async function PagesPage() {
  const { allowed } = await requireStaff("/admin/pages", "content:edit");
  if (!allowed) return <DeniedPage title="Pages" />;

  const [pages, timeZone] = await Promise.all([
    pageCommands().list(await getCurrentStaff()),
    propertyTimeZone(),
  ]);
  if (!pages.ok) throw new Error("Pages are unavailable.");

  return (
    <>
      <PageHeader
        title="Pages"
        description={
          <p>
            The Home, About, and Contact pages. Each has a fixed set of sections
            that you can edit, hide when optional, and reorder.
          </p>
        }
      />
      <DataTable
        caption="Pages"
        rows={pages.value}
        rowKey={(page) => page.key}
        columns={[
          {
            header: "Page",
            rowHeader: true,
            cell: (page) => (
              <>
                <Link
                  href={`/admin/pages/${page.key.toLowerCase()}` as Route}
                  className="admin-table__primary admin-link"
                >
                  {page.title}
                </Link>
                <span className="admin-table__secondary">
                  {page.canonicalPath}
                </span>
              </>
            ),
          },
          {
            header: "Status",
            cell: (page) =>
              page.isPublished ? (
                <Badge tone="success">Published</Badge>
              ) : (
                <Badge tone="warning">Draft</Badge>
              ),
          },
          {
            header: "Ready to publish",
            cell: (page) =>
              page.readiness.length === 0 ? (
                "Yes"
              ) : (
                <Badge tone="warning">
                  {plural(page.readiness.length, "issue")}
                </Badge>
              ),
          },
          {
            header: "Updated",
            cell: (page) => (
              <time dateTime={page.updatedAt.toISOString()}>
                {formatDateTime(page.updatedAt, timeZone)}
              </time>
            ),
          },
        ]}
      />
    </>
  );
}
