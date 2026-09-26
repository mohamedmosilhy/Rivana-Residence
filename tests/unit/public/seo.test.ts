import { describe, expect, it } from "vitest";

import {
  absoluteUrl,
  breadcrumbJsonLd,
  hotelJsonLd,
  roomJsonLd,
  serializeJsonLd,
} from "@/application/public/seo";
import type {
  PublicRoom,
  PublicSettings,
} from "@/application/public/view-models";

const image = {
  src: "/media/rivana/hero.jpg",
  alt: "Rivana Residence exterior",
  width: 1600,
  height: 900,
  position: "50% 50%",
} as const;

const settings: PublicSettings = {
  siteName: "Rivana Residence",
  tagline: "A calm stay in New Cairo.",
  phone: "+20 2 1234 5678",
  email: "stay@rivana.example",
  addressLine1: "Fifth Settlement",
  addressLine2: null,
  city: "New Cairo",
  country: "Egypt",
  addressLines: ["Fifth Settlement", "New Cairo, Egypt"],
  latitude: 30.0131,
  longitude: 31.4913,
  mapEmbedUrl: null,
  footerText: null,
  defaultSeoTitle: "Rivana Residence",
  defaultSeoDescription: "Serviced rooms in New Cairo.",
  socialLinks: [
    {
      platform: "instagram",
      label: "Instagram",
      url: "https://instagram.com/rivana",
    },
  ],
  logo: image,
  favicon: image,
  defaultShareImage: image,
};

const room: PublicRoom = {
  slug: "studio-with-balcony",
  name: "Studio with Balcony",
  shortDescription: "A bright studio with a private balcony.",
  featured: true,
  updatedAt: "2026-09-26T10:00:00.000Z",
  facts: {
    sizeSqm: 38,
    maxAdults: 2,
    maxChildren: 1,
    bedSummary: "Two single beds",
    viewSummary: "Neighbourhood view",
  },
  hero: image,
  description: { type: "doc", content: [] },
  features: ["Balcony"],
  gallery: [],
  socialImage: null,
  seoTitle: null,
  seoDescription: null,
};

function flattened(value: unknown) {
  return JSON.stringify(value).toLowerCase();
}

describe("public SEO data", () => {
  it("builds absolute canonical URLs without duplicate slashes", () => {
    expect(absoluteUrl("https://rivana.example", "/rooms")).toBe(
      "https://rivana.example/rooms",
    );
  });

  it("publishes verified Hotel identity without commercial claims", () => {
    const data = hotelJsonLd(settings, "https://rivana.example");
    expect(data).toMatchObject({
      "@type": "Hotel",
      name: "Rivana Residence",
      address: { addressLocality: "New Cairo", addressCountry: "Egypt" },
      geo: { latitude: 30.0131, longitude: 31.4913 },
    });
    expect(flattened(data)).not.toMatch(
      /offer|price|availability|rating|review/,
    );
  });

  it("builds ordered canonical breadcrumbs", () => {
    expect(
      breadcrumbJsonLd("https://rivana.example", [
        { name: "Home", path: "/" },
        { name: "Rooms", path: "/rooms" },
      ]),
    ).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { position: 1, item: "https://rivana.example/" },
        { position: 2, item: "https://rivana.example/rooms" },
      ],
    });
  });

  it("uses only visible room facts and links the room to the hotel", () => {
    const data = roomJsonLd(room, settings, "https://rivana.example");
    expect(data).toMatchObject({
      "@type": "HotelRoom",
      maximumAttendeeCapacity: 3,
      floorSize: { value: 38, unitCode: "MTK" },
      containedInPlace: { name: "Rivana Residence" },
    });
    expect(flattened(data)).not.toMatch(
      /offer|price|availability|rating|review/,
    );
  });

  it("escapes markup-like text before embedding JSON-LD", () => {
    expect(serializeJsonLd({ value: "</script>" })).toContain(
      "\\u003c/script>",
    );
  });
});
