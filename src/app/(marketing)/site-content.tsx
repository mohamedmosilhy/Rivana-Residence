import "server-only";

import type { Metadata } from "next";

import type {
  PublicImage,
  PublicPage,
  PublicSettings,
} from "@/application/public/view-models";
import {
  getBookingStatus,
  getPublicOrigin,
  getPublishedFacilities,
  getPublishedRooms,
  getSiteSettings,
  issueContactFormToken,
} from "@/composition/public";
import { ContactForm } from "@/presentation/site/contact-form";
import { PageSections } from "@/presentation/site/sections/section-renderer";

import { submitEnquiryAction } from "./actions";

export async function bookingMessage() {
  const booking = await getBookingStatus();
  return booking.available
    ? "Booking opens in a new window."
    : booking.accessibleMessage;
}

/** Renders a managed page's visible sections with the data they need. */
export async function ManagedPageSections({
  page,
  startIndex = 0,
}: Readonly<{ page: PublicPage; startIndex?: number }>) {
  const types = new Set(page.sections.map((section) => section.type));
  const [rooms, facilities, message, settings] = await Promise.all([
    types.has("ROOM_GRID") ? getPublishedRooms() : Promise.resolve([]),
    types.has("FACILITY_GRID") ? getPublishedFacilities() : Promise.resolve([]),
    bookingMessage(),
    getSiteSettings(),
  ]);
  return (
    <PageSections
      sections={page.sections}
      startIndex={startIndex}
      context={{
        rooms,
        facilities,
        bookingMessage: message,
        heroSize: page.key === "HOME" ? "full" : "page",
        // The Contact page lists these details in its own "Find us" block.
        contactDetails: page.key === "CONTACT" ? null : settings,
        contactForm: types.has("CONTACT_CTA") ? (
          <ContactForm
            action={submitEnquiryAction}
            formToken={issueContactFormToken()}
          />
        ) : null,
      }}
    />
  );
}

/** Page metadata with the site-wide defaults as fallback. */
export async function pageMetadata(input: {
  title: string | null;
  description: string | null;
  image?: PublicImage | null | undefined;
  path: string;
}): Promise<Metadata> {
  const settings: PublicSettings | null = await getSiteSettings();
  const origin = getPublicOrigin();
  const siteName = settings?.siteName ?? "Rivana Residence";
  const title = input.title ?? settings?.defaultSeoTitle ?? siteName;
  const description =
    input.description ?? settings?.defaultSeoDescription ?? undefined;
  const image = input.image ?? settings?.defaultShareImage ?? null;
  const canonical = new URL(input.path, `${origin}/`).toString();
  const socialImage = image
    ? {
        url: new URL(image.src, `${origin}/`).toString(),
        width: image.width,
        height: image.height,
        alt: image.alt || `${siteName} photograph`,
      }
    : null;
  return {
    title: input.path === "/" ? { absolute: title } : title,
    ...(description ? { description } : {}),
    alternates: { canonical },
    openGraph: {
      type: "website",
      locale: "en_EG",
      siteName,
      title,
      url: canonical,
      ...(description ? { description } : {}),
      ...(socialImage ? { images: [socialImage] } : {}),
    },
    twitter: {
      card: socialImage ? "summary_large_image" : "summary",
      title,
      ...(description ? { description } : {}),
      ...(socialImage
        ? { images: [{ url: socialImage.url, alt: socialImage.alt }] }
        : {}),
    },
  };
}
