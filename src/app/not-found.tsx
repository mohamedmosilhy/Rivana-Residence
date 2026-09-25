import Link from "next/link";

import { BrandMark } from "@/presentation/design/brand-mark";

// Unmatched URLs outside any route group land here.
export default function NotFound() {
  return (
    <main id="main-content" className="site-holding site-holding--bare">
      <BrandMark />
      <h1>This page could not be found</h1>
      <p>It may have moved or is not available yet.</p>
      <p>
        <Link href="/" className="site-button">
          Go to the home page
        </Link>
      </p>
    </main>
  );
}
