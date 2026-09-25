import type { Metadata, Route } from "next";

import { pageCount } from "@/application/shared/pagination";
import { getCurrentStaff, requireStaff } from "@/composition/auth";
import { mediaLibrary } from "@/composition/media";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { MediaGrid } from "@/presentation/admin/media/media-grid";
import { Uploader } from "@/presentation/admin/media/uploader";
import { ListFilters, Pagination } from "@/presentation/admin/ui/list-controls";
import { Notice, noticeFrom } from "@/presentation/admin/ui/notice";
import { PageHeader } from "@/presentation/admin/ui/page-header";
import { EmptyState } from "@/presentation/admin/ui/states";

export const metadata: Metadata = { title: "Media" };

type MediaPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function MediaPage({ searchParams }: MediaPageProps) {
  const { allowed } = await requireStaff("/admin/media", "media:upload");
  if (!allowed) return <DeniedPage title="Media" />;

  const params = await searchParams;
  const library = await mediaLibrary();
  const listing = await library.list(await getCurrentStaff(), params);
  if (!listing.ok) throw new Error("The media library is unavailable.");
  const { items, total, page, pageSize, query } = listing.value;
  const filtered = Boolean(
    query.search ||
      query.status ||
      query.mimeType ||
      query.missingAlt ||
      query.usage ||
      query.rights,
  );

  const hrefFor = (target: number) => {
    const search = new URLSearchParams();
    if (query.search) search.set("q", query.search);
    if (query.status) search.set("status", query.status);
    if (query.mimeType) search.set("type", query.mimeType);
    if (query.missingAlt) search.set("alt", "missing");
    if (query.usage) search.set("usage", query.usage);
    if (query.rights) search.set("rights", query.rights);
    if (target > 1) search.set("page", String(target));
    const value = search.toString();
    return `/admin/media${value ? `?${value}` : ""}` as Route;
  };

  return (
    <>
      <PageHeader
        title="Media"
        description={
          <p>
            Every image used on the website. Images are checked and cleaned when
            uploaded, and an image that is in use cannot be deleted.
          </p>
        }
      />
      <Notice code={noticeFrom(params.notice)} />
      <Uploader />
      <h2 className="admin-section__title admin-media-heading">Library</h2>
      <ListFilters
        action="/admin/media"
        searchLabel="Search description, file name, or caption"
        search={query.search}
        filters={[
          {
            name: "status",
            label: "Status",
            value: query.status,
            allLabel: "Ready and failed",
            options: [
              { value: "READY", label: "Ready" },
              { value: "FAILED", label: "Failed uploads" },
              { value: "PENDING", label: "Uploading" },
            ],
          },
          {
            name: "type",
            label: "Type",
            value: query.mimeType,
            allLabel: "Any type",
            options: [
              { value: "image/jpeg", label: "JPEG" },
              { value: "image/png", label: "PNG" },
              { value: "image/webp", label: "WebP" },
              { value: "image/avif", label: "AVIF" },
            ],
          },
          {
            name: "alt",
            label: "Alt text",
            value: query.missingAlt ? "missing" : null,
            allLabel: "Any",
            options: [{ value: "missing", label: "Missing alt text" }],
          },
          {
            name: "usage",
            label: "Usage",
            value: query.usage,
            allLabel: "Any",
            options: [
              { value: "used", label: "In use" },
              { value: "unused", label: "Unused" },
            ],
          },
          {
            name: "rights",
            label: "Rights",
            value: query.rights,
            allLabel: "Any",
            options: [
              { value: "CONFIRMED", label: "Confirmed" },
              { value: "UNCONFIRMED", label: "Not confirmed" },
            ],
          },
        ]}
      />
      {items.length > 0 ? (
        <MediaGrid items={items} />
      ) : filtered ? (
        <EmptyState title="No images match these filters">
          <p>Try a different search or filter, or clear the filters.</p>
        </EmptyState>
      ) : (
        <EmptyState title="The library is empty">
          <p>Upload the first images above.</p>
        </EmptyState>
      )}
      <Pagination
        page={page}
        pageCount={pageCount(total, pageSize)}
        total={total}
        pageSize={pageSize}
        hrefFor={hrefFor}
        itemLabel="images"
      />
    </>
  );
}
