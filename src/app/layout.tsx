import type { Metadata } from "next";
import type { ReactNode } from "react";

import { jost, marcellus } from "@/app/fonts";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Rivana Residence",
    template: "%s | Rivana Residence",
  },
  description: "Rivana Residence website foundation.",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${jost.variable} ${marcellus.variable}`}>
      <body>{children}</body>
    </html>
  );
}
