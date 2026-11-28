import type { Route } from "next";
import Link from "next/link";

import { link } from "@/presentation/site/classes";
import { Icon } from "@/presentation/site/icons";

export type HotelContactDetails = Readonly<{
  slug: string;
  phone: string | null;
  email: string | null;
}>;

/** The branch's contact links, wherever the guest should reach the hotel. */
export function HotelContact({
  contact,
  contactPage = true,
}: Readonly<{
  contact: HotelContactDetails;
  /** False for a branch that has no public pages now. */
  contactPage?: boolean;
}>) {
  const { slug, phone, email } = contact;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-7">
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
      {contactPage && (
        <Link href={`/${slug}/contact` as Route} className={link}>
          Contact the hotel
        </Link>
      )}
    </div>
  );
}
