import type { Metadata } from "next";

import { requireStaff } from "@/composition/auth";
import { propertyTimeZone } from "@/composition/content";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { PromotionForm } from "@/presentation/admin/promotions/promotion-form";
import { PageHeader } from "@/presentation/admin/ui/page-header";

import { createPromotionAction } from "../actions";

export const metadata: Metadata = { title: "Add promotion" };

export default async function NewPromotionPage() {
  const { allowed } = await requireStaff(
    "/admin/promotions/new",
    "promotions:manage",
  );
  if (!allowed) return <DeniedPage title="Add promotion" />;

  return (
    <>
      <PageHeader
        title="Add promotion"
        breadcrumbs={[
          { label: "Overview", href: "/admin" },
          { label: "Promotions", href: "/admin/promotions" },
        ]}
        description={<p>New promotions are saved as private drafts.</p>}
      />
      <PromotionForm
        action={createPromotionAction}
        timeZone={await propertyTimeZone()}
        submitLabel="Create draft"
        values={{
          internalName: "",
          headline: "",
          body: "",
          code: "",
          terms: "",
          startsAt: "",
          endsAt: "",
          priority: "0",
          showAsPopup: true,
        }}
      />
    </>
  );
}
