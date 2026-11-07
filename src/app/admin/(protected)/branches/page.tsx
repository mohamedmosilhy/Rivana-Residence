import type { Metadata, Route } from "next";
import Link from "next/link";

import { getCurrentStaff, requireStaff } from "@/composition/auth";
import { manageBranches } from "@/composition/content";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { Badge } from "@/presentation/admin/ui/badge";
import { DataTable } from "@/presentation/admin/ui/data-table";
import { PageHeader } from "@/presentation/admin/ui/page-header";
import {
  button,
  link,
  tablePrimary,
  tableSecondary,
} from "@/presentation/admin/ui/classes";

export const metadata: Metadata = { title: "Branches" };

export default async function BranchesPage() {
  const { allowed } = await requireStaff("/admin/branches", "branches:manage");
  if (!allowed) return <DeniedPage title="Branches" />;
  const branches = await manageBranches().list(await getCurrentStaff());
  if (!branches.ok) throw new Error("Branches are unavailable.");

  return (
    <>
      <PageHeader
        title="Branches"
        description={
          <p>
            Each active branch has its own website at its web address. With two
            or more active branches, the home page lets visitors choose one.
          </p>
        }
        actions={
          <Link href="/admin/branches/new" className={button()}>
            Add branch
          </Link>
        }
      />
      <DataTable
        caption="Branches"
        rows={branches.value}
        rowKey={(branch) => branch.id}
        columns={[
          {
            header: "Branch",
            rowHeader: true,
            cell: (branch) => (
              <>
                <Link
                  href={`/admin/branches/${branch.id}` as Route}
                  className={`${tablePrimary} ${link}`}
                >
                  {branch.name}
                </Link>
                <span className={tableSecondary}>/{branch.slug}</span>
              </>
            ),
          },
          {
            header: "Status",
            cell: (branch) =>
              branch.status === "ACTIVE" ? (
                <Badge tone="success">Active</Badge>
              ) : (
                <Badge tone="neutral">Inactive</Badge>
              ),
          },
          { header: "City", cell: (branch) => branch.city ?? "–" },
          { header: "Order", cell: (branch) => String(branch.sortOrder) },
        ]}
      />
    </>
  );
}
