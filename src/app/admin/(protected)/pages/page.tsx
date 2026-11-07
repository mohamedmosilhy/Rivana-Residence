import type { Metadata, Route } from "next";
import Link from "next/link";

import { pagePath } from "@/application/public/seo";
import { getCurrentStaff, requireStaff } from "@/composition/auth";
import { pageCommands, propertyTimeZone } from "@/composition/content";
import {
  BranchSelector,
  branchQuery,
} from "@/presentation/admin/content/branch-selector";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { formatDateTime, plural } from "@/presentation/admin/format";
import { Badge } from "@/presentation/admin/ui/badge";
import { DataTable } from "@/presentation/admin/ui/data-table";
import { PageHeader } from "@/presentation/admin/ui/page-header";
import {
  link,
  tablePrimary,
  tableSecondary,
} from "@/presentation/admin/ui/classes";

export const metadata: Metadata = { title: "Pages" };

type PagesPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function PagesPage({ searchParams }: PagesPageProps) {
  const { allowed } = await requireStaff("/admin/pages", "content:edit");
  if (!allowed) return <DeniedPage title="Pages" />;

  const params = await searchParams;
  const [listing, timeZone] = await Promise.all([
    pageCommands().list(await getCurrentStaff(), params.branch),
    propertyTimeZone(),
  ]);
  if (!listing.ok) throw new Error("Pages are unavailable.");
  const { branchChoice, pages } = listing.value;
  const branch = branchChoice.selected;
  const query = branchQuery(branchChoice);

  return (
    <>
      <PageHeader
        title="Pages"
        description={
          <p>
            Each branch has its own Home, About, and Contact pages. Each has a
            fixed set of sections that you can edit, hide when optional, and
            reorder.
          </p>
        }
      />
      <BranchSelector action="/admin/pages" choice={branchChoice} />
      <DataTable
        caption={branch ? `Pages of ${branch.name}` : "Pages"}
        rows={pages}
        rowKey={(page) => page.key}
        columns={[
          {
            header: "Page",
            rowHeader: true,
            cell: (page) => (
              <>
                <Link
                  href={
                    `/admin/pages/${page.key.toLowerCase()}${query ? `?${query}` : ""}` as Route
                  }
                  className={`${tablePrimary} ${link}`}
                >
                  {page.title}
                </Link>
                <span className={tableSecondary}>
                  {branch
                    ? pagePath(branch.slug, page.key)
                    : page.canonicalPath}
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
