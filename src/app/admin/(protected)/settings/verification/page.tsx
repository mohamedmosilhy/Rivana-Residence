import type { Metadata } from "next";

import { readVerificationSettings } from "@/composition/admin-verification";
import { requireStaff } from "@/composition/auth";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { Badge } from "@/presentation/admin/ui/badge";
import { PageHeader } from "@/presentation/admin/ui/page-header";
import { Panel } from "@/presentation/admin/ui/states";
import { VerificationSettingsForm } from "@/presentation/admin/verification/settings-form";

import { saveVerificationSettingsAction } from "./actions";

export const metadata: Metadata = { title: "Guest verification" };

const PATH = "/admin/settings/verification";

export default async function VerificationSettingsPage() {
  const { allowed } = await requireStaff(PATH, "settings:edit");
  if (!allowed) return <DeniedPage title="Guest verification" />;

  const settings = await readVerificationSettings();
  if (!settings.ok) throw new Error("Verification settings are unavailable.");
  const view = settings.value;
  const anyReady = view.whatsAppConfigured || view.emailChannelReady;

  return (
    <>
      <PageHeader
        title="Guest verification"
        breadcrumbs={[
          { label: "Overview", href: "/admin" },
          { label: "Settings", href: "/admin/settings" },
        ]}
        description={
          <p>
            Guests confirm a contact with a code before they book or open their
            bookings. Codes go by WhatsApp, and by email when you allow it.
            Online booking needs at least one of the two.
          </p>
        }
      />

      <Panel title="Status" titleId="verification-status-title" wide>
        <dl className="m-0 grid gap-2 sm:grid-cols-[max-content_1fr]">
          <dt>WhatsApp codes</dt>
          <dd className="m-0">
            <Badge tone={view.whatsAppConfigured ? "success" : "neutral"}>
              {view.whatsAppConfigured ? "Ready" : "Not set up"}
            </Badge>
          </dd>
          <dt>Email delivery</dt>
          <dd className="m-0">
            <Badge tone={view.emailDeliveryConfigured ? "success" : "neutral"}>
              {view.emailDeliveryConfigured ? "Set up" : "Not set up"}
            </Badge>
          </dd>
          <dt>Email codes</dt>
          <dd className="m-0">
            <Badge tone={view.emailChannelReady ? "success" : "neutral"}>
              {view.emailChannelReady ? "Offered" : "Off"}
            </Badge>
          </dd>
        </dl>
        {anyReady ? null : (
          <p>
            <Badge tone="warning">No channel ready</Badge> Branches can&apos;t
            take online bookings until WhatsApp is set up or email codes are
            allowed.
          </p>
        )}
      </Panel>

      <Panel
        title="Verification by email"
        titleId="verification-email-title"
        wide
      >
        <VerificationSettingsForm
          action={saveVerificationSettingsAction}
          enabled={view.emailVerificationEnabled}
          deliveryConfigured={view.emailDeliveryConfigured}
        />
      </Panel>
    </>
  );
}
