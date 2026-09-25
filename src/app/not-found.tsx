import Link from "next/link";

import { BrandLogo } from "@/presentation/site/brand-logo";

// Unmatched URLs outside any route group land here.
export default function NotFound() {
  return (
    <main id="main-content" className="site-holding site-holding--bare">
      <div className="site-holding__content site-container">
        <BrandLogo tone="inverse" className="site-logo" />
        <h1>This page could not be found</h1>
        <p>It may have moved or is not available yet.</p>
        <p className="site-holding__actions">
          <Link href="/" className="site-button">
            Go to the home page
          </Link>
        </p>
      </div>
    </main>
  );
}
