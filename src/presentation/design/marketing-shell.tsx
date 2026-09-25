import type { ReactNode } from "react";

import { BrandMark } from "@/presentation/design/brand-mark";

type MarketingShellProps = Readonly<{
  children: ReactNode;
}>;

export function MarketingShell({ children }: MarketingShellProps) {
  return (
    <div className="marketing-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="marketing-header">
        <div className="marketing-header__inner shell-container">
          <BrandMark />
          <span className="marketing-header__status">Production foundation</span>
        </div>
      </header>
      <main id="main-content" className="marketing-main">
        {children}
      </main>
      <footer className="marketing-footer">
        <div className="marketing-footer__inner shell-container">
          <BrandMark />
          <span>New Cairo</span>
        </div>
      </footer>
    </div>
  );
}
