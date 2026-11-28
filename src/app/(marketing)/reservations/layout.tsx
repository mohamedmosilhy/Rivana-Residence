import type { ReactNode } from "react";

import { getSiteSettings } from "@/composition/public";
import { SiteFooter } from "@/presentation/site/site-footer";
import { SiteHeader } from "@/presentation/site/site-header";
import { SiteShell } from "@/presentation/site/site-shell";

import { bookingMessage } from "../site-content";

/**
 * The guest's own pages (spec 0007, M10-T8). They belong to no single branch,
 * so they use the brand shell of the chooser at `/`.
 */
export default async function ReservationsLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [settings, message] = await Promise.all([
    getSiteSettings(),
    bookingMessage(),
  ]);
  return (
    <SiteShell
      header={<SiteHeader settings={settings} bookingMessage={message} />}
      footer={<SiteFooter settings={settings} />}
    >
      {children}
    </SiteShell>
  );
}
