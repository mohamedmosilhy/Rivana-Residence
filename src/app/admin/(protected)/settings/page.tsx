import type { Metadata } from "next";

import { getAdminSiteSettings, getBookingStatus } from "@/composition/admin";
import { requireStaff } from "@/composition/auth";
import { mediaLibrary } from "@/composition/media";
import { AccessDenied } from "@/presentation/admin/auth/access-denied";
import { formatDateTime } from "@/presentation/admin/format";
import {
  SITE_SETTINGS_FIELDS,
  type SiteSettingsValues,
} from "@/presentation/admin/settings/fields";
import { SiteImagesForm } from "@/presentation/admin/media/site-images-form";
import { SiteSettingsForm } from "@/presentation/admin/settings/site-settings-form";
import { SocialLinksForm } from "@/presentation/admin/settings/social-links-form";
import { Badge } from "@/presentation/admin/ui/badge";
import { PageHeader } from "@/presentation/admin/ui/page-header";
import { EmptyState, Panel } from "@/presentation/admin/ui/states";

import {
  saveSiteImagesAction,
  saveSiteSettingsAction,
  saveSocialLinksAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const { staff, allowed } = await requireStaff(
    "/admin/settings",
    "settings:edit",
  );
  if (!allowed) {
    return (
      <>
        <PageHeader title="Settings" />
        <AccessDenied />
      </>
    );
  }

  const [settings, booking, media] = await Promise.all([
    getAdminSiteSettings(),
    getBookingStatus(),
    mediaLibrary().then((library) => library.options(staff)),
  ]);
  const current = settings.ok ? settings.value : null;

  if (!current) {
    return (
      <>
        <PageHeader title="Settings" />
        <EmptyState title="Site settings are not set up yet">
          <p>
            The database has not been seeded. Ask the developer to run{" "}
            <code>npm run db:seed</code>, then reload this page.
          </p>
        </EmptyState>
      </>
    );
  }

  const values = Object.fromEntries(
    SITE_SETTINGS_FIELDS.map((name) => [name, current[name]?.toString() ?? ""]),
  ) as SiteSettingsValues;
  const version = current.updatedAt.toISOString();
  const lastSaved = `Last saved ${formatDateTime(current.updatedAt, current.timeZone)}${
    current.updatedByName ? ` by ${current.updatedByName}` : ""
  }.`;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Residence details used across the public website. Changes appear on the site as soon as you save."
      />

      <Panel title="Site details" titleId="site-details-title" wide>
        <SiteSettingsForm
          action={saveSiteSettingsAction}
          values={values}
          version={version}
          lastSaved={lastSaved}
        />
      </Panel>

      <Panel
        title="Social links"
        titleId="social-links-title"
        description={<p>Shown in the website footer, in this order.</p>}
        wide
      >
        <SocialLinksForm
          action={saveSocialLinksAction}
          links={current.socialLinks}
          version={version}
        />
      </Panel>

      <Panel
        title="Brand images"
        titleId="brand-images-title"
        description={<p>Chosen from the media library.</p>}
        wide
      >
        <SiteImagesForm
          action={saveSiteImagesAction}
          options={media.ok ? media.value : []}
          values={{
            logoMediaId: current.logoMediaId,
            stickyLogoMediaId: current.stickyLogoMediaId,
            faviconMediaId: current.faviconMediaId,
            defaultOgMediaId: current.defaultOgMediaId,
          }}
        />
      </Panel>

      <Panel title="Property time zone" titleId="timezone-title" wide>
        <p>
          <strong>{current.timeZone}</strong>. Promotion schedules and admin
          times use this zone. Changing it requires a developer.
        </p>
      </Panel>

      <Panel title="Online booking" titleId="booking-title" wide>
        <p className="admin-inline-status">
          <Badge tone="neutral">
            {booking.available ? "Configured" : "Not configured"}
          </Badge>
        </p>
        <p>
          No booking provider is connected. The website tells guests to contact
          the residence directly. A provider can be connected once its contract
          and technical requirements are agreed.
        </p>
      </Panel>
    </>
  );
}
