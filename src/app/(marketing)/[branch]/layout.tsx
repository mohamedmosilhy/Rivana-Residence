import type { ReactNode } from "react";

import { hotelJsonLd } from "@/application/public/seo";
import {
  getActiveBranches,
  getPublicOrigin,
  getSiteSettings,
} from "@/composition/public";
import { SiteFooter } from "@/presentation/site/site-footer";
import { SiteHeader } from "@/presentation/site/site-header";
import { SiteShell } from "@/presentation/site/site-shell";
import { StructuredData } from "@/presentation/site/structured-data";

import { bookingMessage, requireBranch } from "../site-content";

/**
 * Every branch page (ADR 026, spec 0002): resolves the active branch from
 * the URL (404 when unknown or inactive, rendered by the brand 404 above
 * this layout), then renders that branch's header, footer, and Hotel entity.
 */
export default async function BranchLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ branch: string }> }>) {
  const branch = await requireBranch(params);
  const [settings, branches, message] = await Promise.all([
    getSiteSettings(),
    getActiveBranches(),
    bookingMessage(),
  ]);
  return (
    <>
      <StructuredData
        id="hotel-structured-data"
        data={hotelJsonLd(branch, settings, getPublicOrigin())}
      />
      <SiteShell
        header={
          <SiteHeader
            settings={settings}
            bookingMessage={message}
            branch={branch}
            branches={branches.map((item) => ({
              slug: item.slug,
              name: item.name,
              hasListings: item.stayTypes.length > 0,
              hasFacilities: item.hasFacilities,
            }))}
          />
        }
        footer={<SiteFooter settings={settings} branch={branch} />}
      >
        {children}
      </SiteShell>
    </>
  );
}
