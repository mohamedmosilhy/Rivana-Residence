import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/presentation/design/brand-mark";

const futureDestinations = [
  "Pages",
  "Rooms",
  "Facilities",
  "Media",
  "Promotions",
  "Enquiries",
];

type AdminShellProps = Readonly<{
  children: ReactNode;
}>;

export function AdminShell({ children }: AdminShellProps) {
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-content">
        Skip to admin content
      </a>
      <aside className="admin-sidebar" aria-label="Admin navigation">
        <div>
          <BrandMark />
          <nav aria-label="Primary admin">
            <ul className="admin-nav">
              <li>
                <Link href="/admin" aria-current="page">
                  Overview
                </Link>
              </li>
              {futureDestinations.map((destination) => (
                <li key={destination}>
                  <span aria-disabled="true">{destination}</span>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <p className="admin-sidebar__phase">
          Structure only · no protected data
        </p>
      </aside>
      <main id="admin-content" className="admin-main">
        {children}
      </main>
    </div>
  );
}
