import type { ReactNode } from "react";

import { skipLink } from "@/presentation/design/classes";

/** The page frame: skip link, header, the one `main`, footer. */
export function SiteShell({
  header,
  footer,
  children,
}: Readonly<{ header: ReactNode; footer: ReactNode; children: ReactNode }>) {
  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr_auto] bg-canvas text-neutral-950">
      <a className={skipLink} href="#main-content">
        Skip to content
      </a>
      {header}
      <main id="main-content" className="focus:[outline:none]" tabIndex={-1}>
        {children}
      </main>
      {footer}
    </div>
  );
}
