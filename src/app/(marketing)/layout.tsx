import type { ReactNode } from "react";
import { Suspense } from "react";

import { getActivePromotion, getSiteSettings } from "@/composition/public";
import { PromotionPopup } from "@/presentation/features/promotions/promotion-popup";
import { SiteFooter } from "@/presentation/site/site-footer";
import { SiteHeader } from "@/presentation/site/site-header";
import { MotionProvider } from "@/presentation/site/motion/motion-provider";

import { bookingMessage } from "./site-content";

// Rendered in its own Suspense boundary so the promotion query never delays
// the page. No active campaign means no popup markup or script at all.
async function ActivePromotion() {
  const promotion = await getActivePromotion();
  return promotion ? <PromotionPopup promotion={promotion} /> : null;
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
