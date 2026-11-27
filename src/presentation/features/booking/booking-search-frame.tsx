import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import type { PublicBranch } from "@/application/public";
import {
  bookingPanel,
  button,
  container,
  eyebrowDark,
  goldFrame,
  heroTitle,
  link,
} from "@/presentation/site/classes";
import { Icon } from "@/presentation/site/icons";
import { SunRays } from "@/presentation/site/ornaments";
import { SiteImage } from "@/presentation/site/site-image";

export function BookingSearchFrame({
  branch,
  title = "Find your stay",
  children,
}: Readonly<{
  branch: Pick<PublicBranch, "name" | "hero">;
  title?: string;
  children: ReactNode;
}>) {
  return (
    <>
      <header
        data-dark-surface=""
        className="relative isolate overflow-hidden bg-plum-900 text-surface"
      >
        {branch.hero === null && (
          <SunRays className="absolute right-0 bottom-0 -z-1 w-[min(95%,37rem)] text-gold-400 opacity-15" />
        )}
        <div
          className={`${container} grid items-center gap-6 pt-[calc(var(--header-height)+2rem)] pb-16 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-14 md:pb-20`}
        >
          <div className="min-w-0">
            <p className={eyebrowDark}>{branch.name}</p>
            <h1 className={heroTitle}>{title}</h1>
          </div>
          {branch.hero && (
            <div className={goldFrame}>
              <div className="relative aspect-[3/1] overflow-hidden bg-plum-800 md:aspect-[2.4/1]">
                <SiteImage
                  image={branch.hero}
                  fill
                  decorative
                  preload
                  sizes="(min-width: 76rem) 34rem, (min-width: 48rem) 50vw, 100vw"
                />
              </div>
            </div>
          )}
        </div>
      </header>
      <div
        className={`${container} relative z-2 -mt-9 grid gap-[clamp(2.5rem,6vw,5rem)] pb-(--space-section)`}
      >
        {children}
      </div>
    </>
  );
}

export function BookingContact({
  slug,
  phone,
  email,
}: Readonly<{ slug: string; phone: string | null; email: string | null }>) {
  return (
    <section
      className={`${bookingPanel} grid items-start gap-6 md:grid-cols-[1.1fr_1fr] md:gap-10`}
      aria-labelledby="booking-contact"
    >
      <div>
        <h2
          id="booking-contact"
          className="m-0 font-display text-heading-lg text-plum-900"
        >
          Book with the hotel
        </h2>
        <p className="mt-2 mb-0 text-neutral-600">
          Online booking is currently unavailable at this branch. Contact the
          hotel to check dates and arrange your stay.
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap items-start gap-x-7 gap-y-2">
        {phone && (
          <a
            className={`${link} max-w-full`}
            href={`tel:${phone.replace(/[^+0-9]/g, "")}`}
          >
            <Icon name="phone" />
            <span className="wrap-anywhere">{phone}</span>
          </a>
        )}
        {email && (
          <a className={`${link} max-w-full`} href={`mailto:${email}`}>
            <Icon name="mail" />
            <span className="wrap-anywhere tracking-normal normal-case">
              {email}
            </span>
          </a>
        )}
        <Link
          href={`/${slug}/contact` as Route}
          className={button("primary", "max-sm:w-full max-[24rem]:px-4")}
        >
          Contact the hotel <Icon name="arrow" />
        </Link>
      </div>
    </section>
  );
}
