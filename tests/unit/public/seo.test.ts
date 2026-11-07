import { describe, expect, it } from "vitest";

import {
  absoluteUrl,
  breadcrumbJsonLd,
  hotelJsonLd,
  pagePath,
  roomJsonLd,
  serializeJsonLd,
} from "@/application/public/seo";
import type {
  PublicBranch,
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

const branch: PublicBranch = {
  id: "branch-1",
  slug: "new-cairo",
  name: "Rivana Residence New Cairo",
  summary: "Serviced rooms in New Cairo.",
  city: "New Cairo",
  country: "Egypt",
  addressLine1: "Fifth Settlement",
  addressLine2: null,
  addressLines: ["Fifth Settlement", "New Cairo, Egypt"],
  phone: "+20 2 1234 5678",
  email: "stay@rivana.example",
  latitude: 30.0131,
  longitude: 31.4913,
  mapEmbedUrl: null,
  checkInTime: null,
  checkOutTime: null,
  onlineBookingEnabled: false,
  hero: null,
  stayTypes: ["ROOM"],
  hasFacilities: true,
  updatedAt: "2026-11-07T10:00:00.000Z",
};

const room: PublicRoom = {
  slug: "studio-with-balcony",
  name: "Studio with Balcony",
  accommodationType: "ROOM",
  shortDescription: "A bright studio with a private balcony.",
  featured: true,
  updatedAt: "2026-09-26T10:00:00.000Z",
  facts: {
    sizeSqm: 38,
    maxAdults: 2,
    maxChildren: 1,
    bedSummary: "Two single beds",
    viewSummary: "Neighbourhood view",
    bedroomCount: null,
    bathroomCount: null,
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

  // AC-8: one Hotel entity per branch, with that branch's contact.
  it("publishes one verified Hotel per branch without commercial claims", () => {
    const data = hotelJsonLd(branch, settings, "https://rivana.example");
    expect(data).toMatchObject({
      "@type": "Hotel",
      "@id": "https://rivana.example/new-cairo#hotel",
      url: "https://rivana.example/new-cairo",
      name: "Rivana Residence New Cairo",
      telephone: "+20 2 1234 5678",
      address: { addressLocality: "New Cairo", addressCountry: "Egypt" },
      geo: { latitude: 30.0131, longitude: 31.4913 },
      // No branch hero yet, so the brand's default sharing image.
      image: "https://rivana.example/media/rivana/hero.jpg",
      sameAs: ["https://instagram.com/rivana"],
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

  it("builds branch page paths", () => {
    expect(pagePath("new-cairo", "HOME")).toBe("/new-cairo");
    expect(pagePath("new-cairo", "ABOUT")).toBe("/new-cairo/about");
    expect(pagePath("demo-giza", "CONTACT")).toBe("/demo-giza/contact");
  });

  // AC-5: apartments are the general Accommodation type with their counts.
  it("describes an apartment with its bedrooms and bathrooms", () => {
    const data = roomJsonLd(
      {
        ...room,
        accommodationType: "APARTMENT",
        facts: { ...room.facts, bedroomCount: 2, bathroomCount: 1 },
      },
      branch,
      "https://rivana.example",
    );
    expect(data).toMatchObject({
      "@type": "Accommodation",
      url: "https://rivana.example/new-cairo/stay/studio-with-balcony",
      numberOfBedrooms: 2,
      numberOfBathroomsTotal: 1,
    });
    expect(flattened(data)).not.toMatch(/offer|price/);
  });

  it("uses only visible room facts and links the room to its branch hotel", () => {
    const data = roomJsonLd(room, branch, "https://rivana.example");
    expect(data).not.toHaveProperty("numberOfBedrooms");
    expect(data).toMatchObject({
      "@type": "HotelRoom",
      url: "https://rivana.example/new-cairo/stay/studio-with-balcony",
      occupancy: {
        "@type": "QuantitativeValue",
        maxValue: 3,
        unitText: "guests",
      },
      floorSize: { value: 38, unitCode: "MTK" },
      containedInPlace: {
        "@id": "https://rivana.example/new-cairo#hotel",
        name: "Rivana Residence New Cairo",
      },
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
