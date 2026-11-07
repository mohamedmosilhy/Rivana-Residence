import "server-only";

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type {
  PublicBranch,
  PublicImage,
  PublicPage,
  PublicSettings,
} from "@/application/public/view-models";
import {
  getActiveBranchBySlug,
  getActiveBranches,
  getBookingStatus,
  getPublicOrigin,
  getPublishedFacilities,
  getPublishedRooms,
  getSiteSettings,
  issueContactFormToken,
} from "@/composition/public";
import { stayLabel } from "@/domain/catalog";
import { ContactForm } from "@/presentation/site/contact-form";
import { PageSections } from "@/presentation/site/sections/section-renderer";

import { submitEnquiryAction } from "./actions";

export async function bookingMessage() {
  const booking = await getBookingStatus();
  return booking.available
    ? "Booking opens in a new window."
    : booking.accessibleMessage;
}

export type BranchParams = Readonly<{ params: Promise<{ branch: string }> }>;

/**
 * The active branch named by the URL, or a 404 (spec 0002). Cached under
 * the `branches` tag, so the layout, page, and metadata share one lookup.
 */
export async function requireBranch(params: Promise<{ branch: string }>) {
  const branch = await getActiveBranchBySlug((await params).branch);
  if (!branch) notFound();
  return branch;
}

/** Whether two or more branches are active (switcher, distinct titles). */
export async function hasSeveralBranches() {
  return (await getActiveBranches()).length >= 2;
}

/**
 * Index page titles stay distinct between branches once there are several;
 * with one branch they read exactly as before.
 */
export async function branchTitle(title: string, branch: PublicBranch) {
  return (await hasSeveralBranches()) ? `${title} at ${branch.name}` : title;
}

/**
 * Metadata for a branch's managed page (Home, About, Contact). An explicit
 * SEO title or description wins; otherwise, with several active branches,
 * the title names the branch and the description falls back to the branch
 * summary, so branches never share titles (review of M5).
 */
export async function managedPageMetadata(
  branch: PublicBranch,
  page: PublicPage | null,
  fallback: Readonly<{ title: string | null; path: string; home?: boolean }>,
) {
  const several = await hasSeveralBranches();
  const base = page?.seoTitle ?? null;
  const title =
    base ??
    (fallback.home
      ? several
        ? branch.name
        : fallback.title
      : fallback.title && several
        ? `${fallback.title} at ${branch.name}`
        : fallback.title);
  const metadata = await pageMetadata({
    title,
    description: page?.seoDescription ?? branch.summary ?? null,
    image: page?.socialImage,
    path: fallback.path,
    ...(fallback.home ? { absoluteTitle: true } : {}),
  });
  // A branch whose page is not published yet shows a holding hero, which
  // is not for search engines.
  return page
    ? metadata
    : { ...metadata, robots: { index: false, follow: false } };
}

/** The branch's listing label, or "Rooms" for headings when it has none. */
export function stayTitle(branch: PublicBranch) {
  return stayLabel(branch.stayTypes) ?? "Rooms";
}

/** Renders a managed page's visible sections with the data they need. */
export async function ManagedPageSections({
  page,
  branch,
  startIndex = 0,
}: Readonly<{ page: PublicPage; branch: PublicBranch; startIndex?: number }>) {
  const types = new Set(page.sections.map((section) => section.type));
  const [rooms, facilities, message] = await Promise.all([
    types.has("ROOM_GRID") ? getPublishedRooms(branch) : Promise.resolve([]),
    types.has("FACILITY_GRID")
      ? getPublishedFacilities(branch)
      : Promise.resolve([]),
    bookingMessage(),
  ]);
  return (
    <PageSections
      sections={page.sections}
      startIndex={startIndex}
      context={{
        branchSlug: branch.slug,
        stayLabel: stayLabel(branch.stayTypes),
        rooms,
        facilities,
        bookingMessage: message,
        heroSize: page.key === "HOME" ? "full" : "page",
        // The Contact page lists these details in its own "Find us" block.
        contactDetails: page.key === "CONTACT" ? null : branch,
        contactForm: types.has("CONTACT_CTA") ? (
          <ContactForm
            action={submitEnquiryAction}
            formToken={issueContactFormToken()}
            branchSlug={branch.slug}
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
  /** Home pages (the chooser and each branch home) skip the title template. */
  absoluteTitle?: boolean;
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
    title: input.absoluteTitle ? { absolute: title } : title,
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
