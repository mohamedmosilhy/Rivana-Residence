import type { Metadata, Route } from "next";
import Link from "next/link";

import {
  listWhatsAppTemplates,
  readWhatsAppSetup,
} from "@/composition/admin-whatsapp";
import { requireStaff } from "@/composition/auth";
import { propertyTimeZone } from "@/composition/content";
import { DeniedPage } from "@/presentation/admin/denied-page";
import { formatDateTime } from "@/presentation/admin/format";
import { link } from "@/presentation/admin/ui/classes";
import { PageHeader } from "@/presentation/admin/ui/page-header";
import { EmptyState, Panel } from "@/presentation/admin/ui/states";
import { buildWhatsAppCatalog } from "@/presentation/admin/whatsapp/catalog";
import { purposeLabel } from "@/presentation/admin/whatsapp/labels";
import { WhatsAppSetupForm } from "@/presentation/admin/whatsapp/setup-form";
import { WhatsAppSetupStatus } from "@/presentation/admin/whatsapp/status";
import { WhatsAppTemplateForm } from "@/presentation/admin/whatsapp/template-form";
import { WhatsAppTemplateTable } from "@/presentation/admin/whatsapp/template-table";
import { WhatsAppTestMessageForm } from "@/presentation/admin/whatsapp/test-message-form";

import {
  saveWhatsAppSettingsAction,
  saveWhatsAppTemplateAction,
  sendWhatsAppTestAction,
} from "./actions";

export const metadata: Metadata = { title: "WhatsApp" };

const PATH = "/admin/settings/whatsapp";

export default async function WhatsAppSettingsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { allowed } = await requireStaff(PATH, "settings:edit");
  if (!allowed) return <DeniedPage title="WhatsApp" />;

  const [setup, templates, timeZone, query] = await Promise.all([
    readWhatsAppSetup(),
    listWhatsAppTemplates(),
    propertyTimeZone(),
    searchParams,
  ]);
  if (!setup.ok || !templates.ok) {
    throw new Error("WhatsApp setup is unavailable.");
  }

  const view = setup.value;
  const editId = typeof query.edit === "string" ? query.edit : null;
  const editing = templates.value.find((template) => template.id === editId);
  const catalog = buildWhatsAppCatalog();

  return (
    <>
      <PageHeader
        title="WhatsApp"
        breadcrumbs={[
          { label: "Overview", href: "/admin" },
          { label: "Settings", href: "/admin/settings" },
        ]}
        description={
          <p>
            The number and message templates used for booking messages and
            verification codes. Templates are approved in Meta first; enter
            their exact names here.
          </p>
        }
      />

      <Panel title="Status" titleId="wa-status-title" wide>
        <WhatsAppSetupStatus
          configured={view.configured}
          accessTokenConfigured={view.accessTokenConfigured}
          numberSet={view.businessPhoneNumber !== null}
          phoneNumberIdSet={view.providerPhoneNumberId !== null}
          setupGaps={view.setupGaps}
          lastTest={
            view.lastTestAt && view.lastTestOk !== null
              ? {
                  at: formatDateTime(view.lastTestAt, timeZone),
                  ok: view.lastTestOk,
                  error: view.lastTestError,
                }
              : null
          }
        />
      </Panel>

      <Panel title="Number and phone number id" titleId="wa-setup-title" wide>
        <WhatsAppSetupForm
          action={saveWhatsAppSettingsAction}
          values={{
            businessPhoneNumber: view.businessPhoneNumber ?? "",
            providerPhoneNumberId: view.providerPhoneNumberId ?? "",
          }}
        />
      </Panel>

      <Panel title="Templates" titleId="wa-templates-title" wide>
        {templates.value.length === 0 ? (
          <EmptyState title="No templates yet">
            <p>
              Add the templates approved in Meta, starting with the verification
              code and booking confirmed ones.
            </p>
          </EmptyState>
        ) : (
          <WhatsAppTemplateTable
            rows={templates.value}
            editHref={(id) => `${PATH}?edit=${id}#wa-template-form` as Route}
          />
        )}
      </Panel>

      <Panel
        title={editing ? "Edit template" : "Add a template"}
        titleId="wa-template-form"
        wide
        description={
          editing ? (
            <p>
              {purposeLabel(editing.purpose)}.{" "}
              <Link className={link} href={PATH}>
                Add a new template instead
              </Link>
            </p>
          ) : undefined
        }
      >
        <WhatsAppTemplateForm
          // Keyed by id only: a save refreshes the props, and a new key would
          // remount the form and lose its "saved" message.
          key={editing?.id ?? "new"}
          action={saveWhatsAppTemplateAction}
          catalog={catalog}
          template={
            editing
              ? {
                  id: editing.id,
                  purpose: editing.purpose,
                  language: editing.language,
                  providerName: editing.providerName,
                  category: editing.category,
                  variables: editing.variables,
                  previewText: editing.previewText,
                  active: editing.active,
                }
              : null
          }
          cancelHref={PATH}
        />
      </Panel>

      <Panel
        title="Send a test message"
        titleId="wa-test-title"
        wide
        description={
          <p>
            Sends the chosen template with sample values, to see whether Meta
            accepts its name and variables.
          </p>
        }
      >
        <WhatsAppTestMessageForm
          action={sendWhatsAppTestAction}
          templates={templates.value
            .filter((template) => template.active)
            .map((template) => ({
              id: template.id,
              label: `${purposeLabel(template.purpose)}: ${template.providerName}`,
            }))}
        />
      </Panel>
    </>
  );
}
