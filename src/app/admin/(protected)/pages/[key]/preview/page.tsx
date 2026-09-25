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
}: Readonly<{ params: Promise<{ key: string }> }>) {
  const { key: segment } = await params;
  const key = pageKeyFromSegment(segment);
  if (!key) notFound();
  const { staff, allowed } = await requireStaff(
    `/admin/pages/${segment}/preview`,
    "content:edit",
  );
  if (!allowed) return <DeniedPage title="Preview page" />;
  const loaded = await pageCommands().get(staff, key);
  if (!loaded.ok) throw new Error("The page is unavailable.");
  if (!loaded.value) notFound();
  const { page } = loaded.value;

  return (
    <>
      <PageHeader
        title={`Preview: ${page.title}`}
        breadcrumbs={[
          { label: "Overview", href: "/admin" },
          { label: "Pages", href: "/admin/pages" },
          { label: page.title, href: `/admin/pages/${segment}` as Route },
        ]}
      />
      <PagePreview page={page} />
    </>
  );
}
