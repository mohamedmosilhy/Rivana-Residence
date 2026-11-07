import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";

import { pageKeyFromSegment } from "@/application/content/page-commands";
import { requireStaff } from "@/composition/auth";
import { pageCommands } from "@/composition/content";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { PagePreview } from "@/presentation/admin/pages/page-preview";
import { PageHeader } from "@/presentation/admin/ui/page-header";

export const metadata: Metadata = { title: "Preview page" };

export default async function PagePreviewPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { key: segment } = await params;
  const { branch: branchParam } = await searchParams;
  const key = pageKeyFromSegment(segment);
  if (!key) notFound();
  const { staff, allowed } = await requireStaff(
    `/admin/pages/${segment}/preview`,
    "content:edit",
  );
  if (!allowed) return <DeniedPage title="Preview page" />;
  const loaded = await pageCommands().get(staff, branchParam, key);
  if (!loaded.ok) throw new Error("The page is unavailable.");
  if (!loaded.value) notFound();
  const { page, branch } = loaded.value;
  const query = `?branch=${encodeURIComponent(branch.slug)}`;

  return (
    <>
      <PageHeader
        title={`Preview: ${page.title} (${branch.name})`}
        breadcrumbs={[
          { label: "Overview", href: "/admin" },
          { label: "Pages", href: `/admin/pages${query}` as Route },
          {
            label: page.title,
            href: `/admin/pages/${segment}${query}` as Route,
          },
        ]}
      />
      <PagePreview page={page} />
    </>
  );
}
