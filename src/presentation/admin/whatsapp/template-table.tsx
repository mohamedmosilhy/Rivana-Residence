import type { Route } from "next";
import Link from "next/link";

import { Badge } from "@/presentation/admin/ui/badge";
import { link } from "@/presentation/admin/ui/classes";
import { DataTable } from "@/presentation/admin/ui/data-table";

import {
  categoryLabel,
  languageLabel,
  purposeLabel,
  variableLabel,
} from "./labels";

export type TemplateRow = Readonly<{
  id: string;
  purpose: string;
  language: string;
  providerName: string;
  category: string;
  variables: readonly string[];
  active: boolean;
}>;

export function WhatsAppTemplateTable({
  rows,
  editHref,
}: Readonly<{
  rows: readonly TemplateRow[];
  editHref: (id: string) => Route;
}>) {
  return (
    <DataTable
      caption="WhatsApp templates"
      rows={rows}
      rowKey={(row) => row.id}
      columns={[
        {
          header: "Purpose",
          rowHeader: true,
          cell: (row) => (
            <>
              <span>{purposeLabel(row.purpose)}</span>
              <span className="block text-[0.875rem] text-neutral-600">
                {languageLabel(row.language)}
              </span>
            </>
          ),
        },
        { header: "Name in Meta", wrap: true, cell: (row) => row.providerName },
        { header: "Category", cell: (row) => categoryLabel(row.category) },
        {
          header: "Variables",
          wrap: true,
          cell: (row) =>
            row.variables.length > 0
              ? row.variables
                  .map((key, index) => `{{${index + 1}}} ${variableLabel(key)}`)
                  .join(", ")
              : "None",
        },
        {
          header: "Status",
          cell: (row) => (
            <Badge tone={row.active ? "success" : "neutral"}>
              {row.active ? "Active" : "Inactive"}
            </Badge>
          ),
        },
        {
          header: "Actions",
          cell: (row) => (
            <Link
              href={editHref(row.id)}
              className={link}
              aria-label={`Edit ${purposeLabel(row.purpose)} (${languageLabel(row.language)}) template`}
            >
              Edit
            </Link>
          ),
        },
      ]}
    />
  );
}
