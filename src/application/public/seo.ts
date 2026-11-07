import type {
  PublicBranch,
  PublicRoom,
  PublicSettings,
} from "@/application/public/view-models";
import type { PageKey } from "@/domain/content/page-sections";

export type JsonLd = Readonly<Record<string, unknown>>;

export function absoluteUrl(origin: string, path: string) {
  return new URL(path, origin.endsWith("/") ? origin : `${origin}/`).toString();
}

function imageUrl(origin: string, path: string | undefined) {
  return path ? absoluteUrl(origin, path) : undefined;
}

/** The public path of a branch page (spec 0002): `/{slug}`, `/{slug}/about`. */
export function pagePath(branchSlug: string, key: PageKey) {
  return key === "HOME"
    ? `/${branchSlug}`
    : `/${branchSlug}/${key.toLowerCase()}`;
}

export function hotelId(origin: string, branchSlug: string) {
  return `${absoluteUrl(origin, `/${branchSlug}`)}#hotel`;
}

/**
 * One Hotel entity per branch, with that branch's address and contact.
 * Verified property identity only: no prices, offers, ratings, or reviews.
 */
export function hotelJsonLd(
  branch: PublicBranch,
  settings: PublicSettings | null,
  origin: string,
): JsonLd {
  const streetAddress = [branch.addressLine1, branch.addressLine2]
    .filter(Boolean)
    .join(", ");
  const address =
    streetAddress || branch.city || branch.country
      ? {
          "@type": "PostalAddress",
          ...(streetAddress ? { streetAddress } : {}),
          ...(branch.city ? { addressLocality: branch.city } : {}),
          ...(branch.country ? { addressCountry: branch.country } : {}),
        }
      : undefined;
  const geo =
    branch.latitude !== null && branch.longitude !== null
      ? {
          "@type": "GeoCoordinates",
          latitude: branch.latitude,
          longitude: branch.longitude,
        }
      : undefined;
  const image = imageUrl(
    origin,
    branch.hero?.src ?? settings?.defaultShareImage?.src,
  );
  const logo = imageUrl(origin, settings?.logo?.src);
  const description = branch.summary ?? settings?.tagline ?? null;
  return {
    "@context": "https://schema.org",
    "@type": "Hotel",
    "@id": hotelId(origin, branch.slug),
    name: branch.name,
    url: absoluteUrl(origin, `/${branch.slug}`),
    ...(description ? { description } : {}),
    ...(branch.phone ? { telephone: branch.phone } : {}),
    ...(branch.email ? { email: branch.email } : {}),
    ...(address ? { address } : {}),
    ...(geo ? { geo } : {}),
    ...(image ? { image } : {}),
    ...(logo ? { logo } : {}),
    ...(settings && settings.socialLinks.length > 0
      ? { sameAs: settings.socialLinks.map((link) => link.url) }
      : {}),
  };
}

export function breadcrumbJsonLd(
  origin: string,
  items: readonly Readonly<{ name: string; path: string }>[],
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(origin, item.path),
    })),
  };
}

/**
 * Visible, verified listing facts only; intentionally contains no Offer
 * data. Rooms are `HotelRoom`; apartments are the general `Accommodation`
 * type with their bedroom and bathroom counts (spec 0002).
 */
export function roomJsonLd(
  room: PublicRoom,
  branch: PublicBranch,
  origin: string,
): JsonLd {
  const path = `/${branch.slug}/stay/${room.slug}`;
  const images = [room.hero, ...room.gallery]
    .filter((image) => image !== null)
    .map((image) => absoluteUrl(origin, image.src));
  const maximumOccupancy = room.facts.maxAdults + room.facts.maxChildren;
  const apartment = room.accommodationType === "APARTMENT";
  return {
    "@context": "https://schema.org",
    "@type": apartment ? "Accommodation" : "HotelRoom",
    "@id": `${absoluteUrl(origin, path)}#${apartment ? "apartment" : "room"}`,
    name: room.name,
    description: room.shortDescription,
    url: absoluteUrl(origin, path),
    ...(images.length > 0 ? { image: images } : {}),
    ...(room.facts.sizeSqm
      ? {
          floorSize: {
            "@type": "QuantitativeValue",
            value: room.facts.sizeSqm,
            unitCode: "MTK",
          },
        }
      : {}),
    ...(apartment && room.facts.bedroomCount !== null
      ? { numberOfBedrooms: room.facts.bedroomCount }
      : {}),
    ...(apartment && room.facts.bathroomCount !== null
      ? { numberOfBathroomsTotal: room.facts.bathroomCount }
      : {}),
    occupancy: {
      "@type": "QuantitativeValue",
      maxValue: maximumOccupancy,
      unitText: "guests",
    },
    containedInPlace: {
      "@id": hotelId(origin, branch.slug),
      name: branch.name,
    },
  };
}

export function serializeJsonLd(data: JsonLd) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
