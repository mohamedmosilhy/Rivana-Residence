import type { Route } from "next";
import Link from "next/link";

import type { MediaReference } from "@/application/ports/repositories";
import type { PublicationStatus } from "@/domain/shared/types";
import { OrderControls } from "@/presentation/admin/content/order-controls";
import { formatDateTime } from "@/presentation/admin/format";
import { Badge, PublicationBadge } from "@/presentation/admin/ui/badge";
import { DataTable, type Column } from "@/presentation/admin/ui/data-table";
import type { FormAction } from "@/presentation/admin/ui/form-state";

export type CatalogRow = Readonly<{
  id: string;
  name: string;
  slug: string;
  status: PublicationStatus;
  featured: boolean;
  updatedAt: Date;
  media: readonly MediaReference[];
}>;

type CatalogTableProps = Readonly<{
  caption: string;
  basePath: "/admin/rooms" | "/admin/facilities";
  rows: readonly CatalogRow[];
  timeZone: string;
  /** Present when the full active order is shown and may be changed. */
  ordering?: Readonly<{
    activeOrder: readonly string[];
    move: (id: string, offset: -1 | 1) => FormAction;
  }>;
}>;

export function CatalogTable({
  caption,
  basePath,
  rows,
  timeZone,
  ordering,
}: CatalogTableProps) {
  const columns: Column<CatalogRow>[] = [
    {
      header: "Name",
      rowHeader: true,
      cell: (row) => (
        <>
          <Link
            href={`${basePath}/${row.id}` as Route}
            className="admin-table__primary admin-link"
          >
            {row.name}
          </Link>
          <span className="admin-table__secondary">/{row.slug}</span>
        </>
      ),
    },
    {
      header: "Status",
      cell: (row) => <PublicationBadge status={row.status} />,
    },
    {
      header: "Featured",
      cell: (row) =>
        row.featured ? <Badge tone="brand">Featured</Badge> : "—",
    },
    {
      header: "Hero image",
      cell: (row) =>
        row.media.some(
          (media) => media.role === "HERO" && media.status === "READY",
        ) ? (
          "Chosen"
        ) : (
          <Badge tone="warning">Missing</Badge>
        ),
    },
    {
      header: "Updated",
      cell: (row) => (
        <time dateTime={row.updatedAt.toISOString()}>
          {formatDateTime(row.updatedAt, timeZone)}
        </time>
      ),
    },
  ];

  if (ordering) {
    const { activeOrder, move } = ordering;
    columns.push({
      header: "Order",
      cell: (row) => {
        const index = activeOrder.indexOf(row.id);
        if (index < 0) return "—";
        return (
          <OrderControls
            id={row.id}
            name={row.name}
            isFirst={index === 0}
            isLast={index === activeOrder.length - 1}
            moveUp={move(row.id, -1)}
            moveDown={move(row.id, 1)}
          />
        );
      },
    });
  }

  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
    />
  );
}
