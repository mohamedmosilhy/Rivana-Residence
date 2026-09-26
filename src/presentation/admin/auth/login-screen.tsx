import type { ReactNode } from "react";

import { BrandMark } from "@/presentation/design/brand-mark";
import { BrandLogo } from "@/presentation/site/brand-logo";
import { SunRays } from "@/presentation/site/ornaments";

export function LoginScreen({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main
      className="grid min-h-screen grid-cols-[minmax(0,1fr)_minmax(0,1fr)] bg-admin-canvas max-lg:grid-cols-[minmax(0,1fr)]"
      id="admin-content"
    >
      <div
        className="relative isolate grid place-content-center justify-items-center gap-6 overflow-hidden bg-plum-950 bg-[radial-gradient(ellipse_at_70%_20%,rgb(101_42_76/0.9),transparent_60%)] text-gold-400 max-lg:hidden"
        aria-hidden="true"
      >
        <SunRays
          className="absolute top-1/2 left-1/2 -z-1 w-[min(90%,40rem)] -translate-x-1/2 -translate-y-1/2 opacity-10"
          motion="draw"
        />
        <BrandLogo tone="inverse" className="h-36 w-auto" eager />
        <p className="m-0 text-[0.75rem] font-medium tracking-[0.3em] uppercase">
          Content studio
        </p>
      </div>
      <section
        className="my-6 w-[min(100%-2rem,26rem)] place-self-center rounded-panel border border-neutral-300 bg-surface p-[clamp(1.5rem,5vw,2.5rem)] text-neutral-800 shadow-[var(--shadow-md)]"
        aria-labelledby="login-title"
      >
        <BrandMark size="login" />
        <h1
          id="login-title"
          className="mt-8 [font-family:var(--font-rivana-display),Georgia,serif] text-[2rem] font-normal"
        >
          Staff sign in
        </h1>
        <p className="mt-3 text-neutral-600">
          Access is limited to Rivana Residence staff accounts. There is no
          public registration.
        </p>
        {children}
        <p className="mt-6 text-[0.875rem] text-neutral-600">
          Forgotten your password? Ask a Rivana administrator to reset it.
        </p>
      </section>
    </main>
  );
}
