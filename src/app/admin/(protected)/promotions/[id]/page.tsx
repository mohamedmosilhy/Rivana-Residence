import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireStaff } from "@/composition/auth";
import { promotionAdmin, propertyTimeZone } from "@/composition/content";
import { roleHasCapability } from "@/domain/auth/capabilities";
import { utcToZonedLocal } from "@/domain/shared/zoned-time";
import { PublicationPanel } from "@/presentation/admin/content/publication-panel";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { formatDateTime } from "@/presentation/admin/format";
import { DisplayNote } from "@/presentation/admin/promotions/display-note";
import { PromotionForm } from "@/presentation/admin/promotions/promotion-form";
import { Notice, noticeFrom } from "@/presentation/admin/ui/notice";
import { PageHeader } from "@/presentation/admin/ui/page-header";

import {
  archivePromotionAction,
  deletePromotionAction,
  publishPromotionAction,
  restorePromotionAction,
  unpublishPromotionAction,
  updatePromotionAction,
} from "../actions";

export const metadata: Metadata = { title: "Edit promotion" };

type EditPromotionPageProps = Readonly<{
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function EditPromotionPage({
  params,
  searchParams,
}: EditPromotionPageProps) {
  const { id } = await params;
  const { staff, allowed } = await requireStaff(
    `/admin/promotions/${id}`,
    "promotions:manage",
  );
  if (!allowed) return <DeniedPage title="Edit promotion" />;

  const [loaded, timeZone, search] = await Promise.all([
    promotionAdmin().get(staff, id),
    propertyTimeZone(),
    searchParams,
  ]);
  if (!loaded.ok) throw new Error("The promotion is unavailable.");
  if (!loaded.value) notFound();
  const { promotion, display } = loaded.value;
  const local = (date: Date | null) =>
    date ? utcToZonedLocal(date, timeZone) : "";

  return (
    <>
      <PageHeader
        title={promotion.internalName}
        breadcrumbs={[
          { label: "Overview", href: "/admin" },
          { label: "Promotions", href: "/admin/promotions" },
        ]}
      />
      <Notice code={noticeFrom(search.notice)} />
      <PublicationPanel
        name={promotion.internalName}
        noun="promotion"
        status={promotion.status}
        readiness={[]}
        actions={{
          publish: publishPromotionAction.bind(null, promotion.id),
          unpublish: unpublishPromotionAction.bind(null, promotion.id),
          archive: archivePromotionAction.bind(null, promotion.id),
          restore: restorePromotionAction.bind(null, promotion.id),
          ...(roleHasCapability(staff.role, "content:delete")
            ? { delete: deletePromotionAction.bind(null, promotion.id) }
            : {}),
        }}
      >
        <DisplayNote
          display={display}
          priority={promotion.priority}
          timeZone={timeZone}
        />
      </PublicationPanel>
      <PromotionForm
        action={updatePromotionAction.bind(null, promotion.id)}
        timeZone={timeZone}
        submitLabel="Save changes"
        meta={`Last saved ${formatDateTime(promotion.updatedAt, timeZone)}.`}
        values={{
          internalName: promotion.internalName,
          headline: promotion.headline,
          body: promotion.body,
          code: promotion.code,
          terms: promotion.terms ?? "",
          startsAt: local(promotion.startsAt),
          endsAt: local(promotion.endsAt),
          priority: String(promotion.priority),
          showAsPopup: promotion.showAsPopup,
        }}
      />
    </>
  );
}
