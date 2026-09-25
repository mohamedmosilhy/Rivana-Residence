import "server-only";

import type { Metadata } from "next";

import type {
  PublicImage,
  PublicPage,
  PublicSettings,
} from "@/application/public/view-models";
import {
  getBookingStatus,
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
  const [rooms, facilities, message] = await Promise.all([
    types.has("ROOM_GRID") ? getPublishedRooms() : Promise.resolve([]),
    types.has("FACILITY_GRID") ? getPublishedFacilities() : Promise.resolve([]),
    bookingMessage(),
  ]);
  return (
    <PageSections
      sections={page.sections}
      startIndex={startIndex}
      context={{
        rooms,
        facilities,
        bookingMessage: message,
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
  image?: PublicImage | null;
  path: string;
}): Promise<Metadata> {
  const settings: PublicSettings | null = await getSiteSettings();
  const description =
    input.description ?? settings?.defaultSeoDescription ?? undefined;
  const image = input.image ?? settings?.defaultShareImage ?? null;
  return {
    ...(input.title ? { title: input.title } : {}),
    ...(description ? { description } : {}),
    alternates: { canonical: input.path },
    openGraph: {
      title:
        input.title ??
        settings?.defaultSeoTitle ??
        settings?.siteName ??
        "Rivana Residence",
      ...(description ? { description } : {}),
      ...(image
        ? {
            images: [
              {
                url: image.src,
                width: image.width,
                height: image.height,
                alt: image.alt,
              },
            ],
          }
        : {}),
    },
  };
}
