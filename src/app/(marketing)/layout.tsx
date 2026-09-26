import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";

import { hotelJsonLd } from "@/application/public/seo";
import {
  getActivePromotion,
  getPublicOrigin,
  getSiteSettings,
} from "@/composition/public";
import { PromotionPopup } from "@/presentation/features/promotions/promotion-popup";
import { SiteFooter } from "@/presentation/site/site-footer";
import { SiteHeader } from "@/presentation/site/site-header";
import { MotionProvider } from "@/presentation/site/motion/motion-provider";
import { StructuredData } from "@/presentation/site/structured-data";

import { bookingMessage } from "./site-content";

// Rendered in its own Suspense boundary so the promotion query never delays
// the page. No active campaign means no popup markup or script at all.
async function ActivePromotion() {
  const promotion = await getActivePromotion();
  return promotion ? <PromotionPopup promotion={promotion} /> : null;
}

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

export default async function MarketingLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [settings, message] = await Promise.all([
    getSiteSettings(),
    bookingMessage(),
  ]);
  return (
    <MotionProvider>
      {settings ? (
        <StructuredData
          id="hotel-structured-data"
          data={hotelJsonLd(settings, getPublicOrigin())}
        />
      ) : null}
      <div className="site-shell">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <SiteHeader settings={settings} bookingMessage={message} />
        <main id="main-content" className="site-main" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter settings={settings} />
        <Suspense fallback={null}>
          <ActivePromotion />
        </Suspense>
      </div>
    </MotionProvider>
  );
}
