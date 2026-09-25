"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

// A <details> disclosure: it opens and closes without JavaScript, and is
// announced as expandable. With JavaScript it also closes after navigating
// and on Escape.
export function MobileMenu({ children }: Readonly<{ children: ReactNode }>) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  return (
    <details
      ref={ref}
      className="site-menu"
      onKeyDown={(event) => {
        if (event.key === "Escape" && ref.current?.open) {
          ref.current.open = false;
          ref.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary className="site-menu__toggle">
        <span aria-hidden="true" className="site-menu__icon" />
        Menu
      </summary>
      <div className="site-menu__panel">{children}</div>
    </details>
  );
}
