import type {
  PublicRoom,
  PublicSettings,
} from "@/application/public/view-models";

export type JsonLd = Readonly<Record<string, unknown>>;

export function absoluteUrl(origin: string, path: string) {
  return new URL(path, origin.endsWith("/") ? origin : `${origin}/`).toString();
}

function imageUrl(origin: string, path: string | undefined) {
  return path ? absoluteUrl(origin, path) : undefined;
}

/** Verified property identity only: no prices, offers, ratings, or reviews. */
export function hotelJsonLd(settings: PublicSettings, origin: string): JsonLd {
  const streetAddress = [settings.addressLine1, settings.addressLine2]
    .filter(Boolean)
    .join(", ");
  const address =
    streetAddress || settings.city || settings.country
      ? {
          "@type": "PostalAddress",
          ...(streetAddress ? { streetAddress } : {}),
          ...(settings.city ? { addressLocality: settings.city } : {}),
          ...(settings.country ? { addressCountry: settings.country } : {}),
        }
      : undefined;
  const geo =
    settings.latitude !== null && settings.longitude !== null
      ? {
          "@type": "GeoCoordinates",
          latitude: settings.latitude,
          longitude: settings.longitude,
        }
      : undefined;
  const image = imageUrl(origin, settings.defaultShareImage?.src);
  const logo = imageUrl(origin, settings.logo?.src);
  return {
    "@context": "https://schema.org",
    "@type": "Hotel",
    "@id": `${absoluteUrl(origin, "/")}#hotel`,
    name: settings.siteName,
    url: absoluteUrl(origin, "/"),
    ...(settings.tagline ? { description: settings.tagline } : {}),
    ...(settings.phone ? { telephone: settings.phone } : {}),
    ...(settings.email ? { email: settings.email } : {}),
    ...(address ? { address } : {}),
    ...(geo ? { geo } : {}),
    ...(image ? { image } : {}),
    ...(logo ? { logo } : {}),
    ...(settings.socialLinks.length > 0
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

/** Visible, verified room facts only; intentionally contains no Offer data. */
export function roomJsonLd(
  room: PublicRoom,
  settings: PublicSettings | null,
  origin: string,
): JsonLd {
  const images = [room.hero, ...room.gallery]
    .filter((image) => image !== null)
    .map((image) => absoluteUrl(origin, image.src));
  const maximumOccupancy = room.facts.maxAdults + room.facts.maxChildren;
  return {
    "@context": "https://schema.org",
    "@type": "HotelRoom",
    "@id": `${absoluteUrl(origin, `/rooms/${room.slug}`)}#room`,
    name: room.name,
    description: room.shortDescription,
    url: absoluteUrl(origin, `/rooms/${room.slug}`),
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
    maximumAttendeeCapacity: maximumOccupancy,
    ...(settings
      ? {
          containedInPlace: {
            "@id": `${absoluteUrl(origin, "/")}#hotel`,
            name: settings.siteName,
          },
        }
      : {}),
  };
}

export function serializeJsonLd(data: JsonLd) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
