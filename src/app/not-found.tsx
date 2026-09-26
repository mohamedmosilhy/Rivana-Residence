import Link from "next/link";
import { connection } from "next/server";

import { BrandLogo } from "@/presentation/site/brand-logo";
import {
  button,
  heroTitle,
  holding,
  holdingActions,
  holdingContent,
  holdingText,
} from "@/presentation/site/classes";

// Unmatched URLs outside any route group land here. Rendered per request so
// its scripts carry the CSP nonce.
export default async function NotFound() {
  await connection();
  return (
    <main id="main-content" data-dark-surface="" className={holding}>
      <div className={`${holdingContent} py-16`}>
        <BrandLogo tone="inverse" className="mb-4 h-24 w-auto" eager />
        <h1 className={heroTitle}>This page could not be found</h1>
        <p className={holdingText}>
          It may have moved or is not available yet.
        </p>
        <p className={holdingActions}>
          <Link href="/" className={button("primary-dark")}>
            Go to the home page
          </Link>
        </p>
      </div>
    </main>
  );
}
