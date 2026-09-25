import type { ReactNode } from "react";

type FoundationNoticeProps = Readonly<{
  children: ReactNode;
}>;

export function FoundationNotice({ children }: FoundationNoticeProps) {
  return (
    <p className="foundation-notice" role="status">
      {children}
    </p>
  );
}
