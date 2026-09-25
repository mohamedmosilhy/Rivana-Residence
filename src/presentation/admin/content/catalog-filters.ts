import type { CatalogListQuery } from "@/application/content/catalog-queries";

export function catalogFilters(query: CatalogListQuery) {
  return [
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
      name: "featured",
      label: "Featured",
      value: query.featured === null ? null : query.featured ? "yes" : "no",
      allLabel: "Any",
      options: [
        { value: "yes", label: "Featured" },
        { value: "no", label: "Not featured" },
      ],
    },
  ];
}
