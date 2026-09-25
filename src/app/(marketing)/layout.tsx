import type { ReactNode } from "react";

import { MarketingShell } from "@/presentation/design/marketing-shell";

type MarketingLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function MarketingLayout({ children }: MarketingLayoutProps) {
  return <MarketingShell>{children}</MarketingShell>;
}
