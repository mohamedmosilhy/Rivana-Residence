import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getPublicOrigin, getSiteSettings } from "@/composition/public";
import { MotionProvider } from "@/presentation/site/motion/motion-provider";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const origin = getPublicOrigin();
  const siteName = settings?.siteName ?? "Rivana Residence";
  const title = settings?.defaultSeoTitle ?? siteName;
  const description =
    settings?.defaultSeoDescription ??
    "Rivana Residence: serviced rooms and suites in New Cairo.";
  return {
    metadataBase: new URL(origin),
    applicationName: siteName,
    title: { default: title, template: `%s | ${siteName}` },
    description,
    category: "travel",
    icons: {
      icon: settings?.favicon?.src ?? "/rivana-icon.png",
      apple: "/apple-icon.png",
    },
    openGraph: {
      type: "website",
      locale: "en_EG",
      siteName,
      title,
      description,
      url: origin,
    },
    twitter: { card: "summary", title, description },
  };
}

/**
 * Fonts, motion, and site metadata. The header, footer, and Hotel JSON-LD
 * come from the branch layout (`[branch]/layout.tsx`) or, for the chooser
 * and top-level 404, the brand-only shell (spec 0002). No promotion popup
 * (retired, Q-47).
 */
export default function MarketingLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <MotionProvider>{children}</MotionProvider>;
}
