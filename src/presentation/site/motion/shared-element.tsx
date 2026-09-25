import * as React from "react";
import type { ReactNode } from "react";

// React's <ViewTransition> ships in the React build bundled with the Next.js
// App Router. Elsewhere (unit tests run the stable react package) it is
// missing, and the children render unchanged.
const ViewTransition = (
  React as unknown as {
    ViewTransition?: React.ComponentType<{
      name: string;
      share: string;
      default: string;
      children: ReactNode;
    }>;
  }
).ViewTransition;

/**
 * Marks the same photograph on two pages (a room card and the room's hero)
 * so navigating between them morphs one into the other. Browsers without the
 * View Transitions API simply navigate. Names must be unique on each page.
 */
export function SharedElement({
  name,
  children,
}: Readonly<{ name: string; children: ReactNode }>) {
  if (!ViewTransition) return children;
  return (
    <ViewTransition name={name} share="site-morph" default="none">
      {children}
    </ViewTransition>
  );
}
