// Initial website content, taken from the previous rivanaresidence.com
// (WordPress) site: its rooms, facilities, page copy, contact details, map
// location, social links, and photography (full-size originals in ./images).
//
// Deliberately left out: prices ("from $60"), availability search, bookings,
// guests, payments, and the booking/refund policy pages. Rivana does not own
// that data; the future booking provider does.
//
// The old site had no written room descriptions (only facts and photos), so
// room descriptions below are drafted from those facts and photos. The old
// "Wellness & Spa" and "Fitness Center" teaser copy was theme placeholder text
// and is not used.

export type SeedImage = Readonly<{ file: string; alt: string }>;

/** Every photo, with alt text written from the image itself. */
export const IMAGES = {
  homeHero: {
    file: "home-hero.jpg",
    alt: "Lobby lounge with sofas and plants, with the pool visible through the glass door",
  },
  homeWelcome: {
    file: "home-welcome.jpg",
    alt: "Bright lobby lounge with beige sofas and potted plants",
  },
  exterior: {
    file: "exterior.jpg",
    alt: "Front of the Rivana Residence building at dusk, with balconies on every floor",
  },
  exteriorWide: {
    file: "exterior-wide.jpg",
    alt: "Rivana Residence building with Rivana banners at the gated entrance",
  },
  pool: {
    file: "pool.jpg",
    alt: "Indoor pool beside sun loungers, with the gym in the background",
  },
  pool01: {
    file: "pool-01.jpg",
    alt: "Indoor swimming pool with a stone wall and warm wall lights",
  },
  pool02: {
    file: "pool-02.jpg",
    alt: "Swimming pool seen from directly above",
  },
  pool03: {
    file: "pool-03.jpg",
    alt: "Steps into the indoor pool, with wall lights reflected on the water",
  },
  pool04: {
    file: "pool-04.jpg",
    alt: "Two guests relaxing at the edge of the pool, seen from above",
  },
  gym: {
    file: "gym.jpg",
    alt: "Glass-walled gym with a weight machine, dumbbells, exercise bikes, and a treadmill",
  },
  gym02: {
    file: "gym-02.jpg",
    alt: "Dumbbell racks, a balance ball, and an exercise mat in the gym",
  },
  gym03: {
    file: "gym-03.jpg",
    alt: "Multi-station weight machine and punching bag in the gym",
  },
  gym04: {
    file: "gym-04.jpg",
    alt: "Weight machine and punching bag under warm cove lighting",
  },
  gym05: { file: "gym-05.jpg", alt: "Treadmill and exercise bike in the gym" },
  double0: {
    file: "double-room-0.jpg",
    alt: "Double room with a wood-panelled wall, double bed, desk, and armchair",
  },
  double1: {
    file: "double-room-1.jpg",
    alt: "Double bed with white linen and folded towels against a wood-panelled headboard",
  },
  double2: {
    file: "double-room-2.jpg",
    alt: "The double room seen from the entrance door",
  },
  double3: {
    file: "double-room-3.jpg",
    alt: "Seating corner with a pink sofa, round table, and chair beneath abstract art",
  },
  double4: {
    file: "double-room-4.jpg",
    alt: "Pink sofa, round side table, and chair in the room's seating area",
  },
  double5: {
    file: "double-room-5.jpg",
    alt: "Wooden desk with a mirror, television, and kettle",
  },
  double6: {
    file: "double-room-6.jpg",
    alt: "Kitchenette with wooden cabinets, a sink, and a microwave",
  },
  double7: {
    file: "double-room-7.jpg",
    alt: "Bathroom with a black vanity, backlit mirror, and glass shower screen",
  },
  double8: {
    file: "double-room-8.jpg",
    alt: "Walk-in shower with a rainfall head and black fittings",
  },
  twin0: {
    file: "twin-room-0.jpg",
    alt: "Studio with two single beds against a wood-panelled wall",
  },
  twin1: {
    file: "twin-room-1.jpg",
    alt: "Two single beds with bedside lamps and the balcony door behind",
  },
  twin2: {
    file: "twin-room-2.jpg",
    alt: "Desk with a television and a seating corner by the window",
  },
  twin3: {
    file: "twin-room-3.jpg",
    alt: "Kitchenette with light wood cabinets opening onto the studio",
  },
  twin4: {
    file: "twin-room-4.jpg",
    alt: "Seating area with a sofa, round table, and framed horse artwork",
  },
  twin5: { file: "twin-room-5.jpg", alt: "Studio entrance door and hallway" },
  twin6: {
    file: "twin-room-6.jpg",
    alt: "Bathroom with a walk-in shower, black vanity, and backlit mirror",
  },
  twin7: {
    file: "twin-room-7.jpg",
    alt: "Bathroom vanity with a backlit mirror beside the door",
  },
  twin8: {
    file: "twin-room-8.jpg",
    alt: "Guest on the studio balcony looking out over the neighbourhood",
  },
  crest: { file: "favicon.png", alt: "Rivana Residence crest" },
} as const satisfies Record<string, SeedImage>;

export type ImageKey = keyof typeof IMAGES;

export const SETTINGS = {
  siteName: "Rivana Residence",
  tagline: "Luxury is a state of mind, and here, it's our reality.",
  phone: "+20 10 5555 3086",
  email: "info@rivanaresidence.com",
  addressLine1: "Plot 46 A, District 37, Southern Investors",
  addressLine2: "Opposite the American University and El Zohour Club",
  city: "New Cairo 1, Cairo",
  country: "Egypt",
  // From the old Contact page map pin.
  latitude: 30.0162009,
  longitude: 31.4935526,
  footerText: "© Rivana Residence",
  defaultSeoTitle: "Rivana Residence | Luxury Hotel in New Cairo",
  defaultSeoDescription:
    "Rivana Residence is a luxury hotel in the Fifth Settlement, New Cairo, opposite the American University and El Zohour Club.",
  socialLinks: [
    {
      platform: "facebook",
      label: "Facebook",
      url: "https://www.facebook.com/rivanaresidence/",
    },
    {
      platform: "instagram",
      label: "Instagram",
      url: "https://www.instagram.com/rivanaresidence/",
    },
    { platform: "x", label: "X", url: "https://x.com/rivanaresidence" },
    {
      platform: "linkedin",
      label: "LinkedIn",
      url: "https://www.linkedin.com/company/rivanaresidence",
    },
    {
      platform: "youtube",
      label: "YouTube",
      url: "https://www.youtube.com/@RivanaResidence",
    },
    {
      platform: "tiktok",
      label: "TikTok",
      url: "https://www.tiktok.com/@rivanaresidence",
    },
  ],
} as const;

type RoomSeed = Readonly<{
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  sizeSqm: number;
  maxAdults: number;
  maxChildren: number;
  bedSummary: string;
  viewSummary: string;
  features: readonly string[];
  hero: ImageKey;
  gallery: readonly ImageKey[];
}>;

const DOUBLE_GALLERY = [
  "double1",
  "double3",
  "double4",
  "double5",
  "double6",
  "double7",
  "double8",
] as const satisfies readonly ImageKey[];

/** In the old site's order. Facts are from the old room pages. */
export const ROOMS: readonly RoomSeed[] = [
  {
    name: "Studio with Pool View",
    slug: "studio-with-pool-view",
    shortDescription:
      "A 50 m² studio overlooking the pool, with a queen bed and a kitchenette.",
    description:
      "A spacious studio that looks out over the residence's pool, finished in warm wood with a wood-panelled headboard wall.\n\nA queen bed faces a seating corner and desk, and the kitchenette and walk-in shower make longer stays easy.",
    sizeSqm: 50,
    maxAdults: 2,
    maxChildren: 1,
    bedSummary: "One queen bed",
    viewSummary: "Pool view",
    features: ["Kitchenette", "Work desk", "Seating area", "Walk-in shower"],
    hero: "double0",
    gallery: [...DOUBLE_GALLERY, "pool01"],
  },
  {
    name: "Studio with Balcony",
    slug: "studio-with-balcony",
    shortDescription:
      "A 55 m² studio with two twin beds, a kitchenette, and a private balcony.",
    description:
      "Our largest studio, with two twin beds set against a wood-panelled wall and a private balcony over the neighbourhood.\n\nA seating area, work desk, and kitchenette make it easy to settle in, whether you are here for business or a family visit.",
    sizeSqm: 55,
    maxAdults: 2,
    maxChildren: 1,
    bedSummary: "Two twin beds",
    viewSummary: "City view",
    features: [
      "Private balcony",
      "Kitchenette",
      "Work desk",
      "Seating area",
      "Walk-in shower",
    ],
    hero: "twin1",
    gallery: [
      "twin0",
      "twin8",
      "twin2",
      "twin4",
      "twin3",
      "twin5",
      "twin6",
      "twin7",
    ],
  },
  {
    name: "Deluxe Double",
    slug: "deluxe-double",
    shortDescription:
      "A 45 m² double room with a seating corner, desk, and kitchenette.",
    description:
      "Warm wood, soft lighting, and space to unwind. A double bed faces a seating corner, with a desk for quiet mornings.\n\nThe room has its own kitchenette and a bathroom with a walk-in shower.",
    sizeSqm: 45,
    maxAdults: 2,
    maxChildren: 1,
    bedSummary: "One double bed",
    viewSummary: "City view",
    features: ["Kitchenette", "Work desk", "Seating area", "Walk-in shower"],
    hero: "double2",
    gallery: ["double0", ...DOUBLE_GALLERY],
  },
];

type FacilitySeed = Readonly<{
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  openingHoursText: string | null;
  featured: boolean;
  /** No approved photo means the facility stays an unpublished draft. */
  hero: ImageKey | null;
  gallery: readonly ImageKey[];
}>;

export const FACILITIES: readonly FacilitySeed[] = [
  {
    name: "Swimming Pool",
    slug: "swimming-pool",
    shortDescription:
      "Unwind and refresh with our elegant swimming pool, the perfect escape for relaxation and leisure.",
    description:
      "## Relaxation like never before\n\nUnwind and refresh at Rivana Residence with our elegant swimming pool, offering the perfect escape for relaxation and leisure.\n\n“Dive into comfort at Rivana Residence with our serene swimming pool, the ideal spot to relax, recharge, and enjoy your stay.”",
    openingHoursText: "Daily, 06:00–22:30",
    featured: true,
    hero: "pool01",
    gallery: ["pool02", "pool", "pool04", "pool03"],
  },
  {
    // The slug keeps the approved /gym.html redirect target.
    name: "Gym",
    slug: "fitness-room",
    shortDescription:
      "Stay energized and refreshed at our fully equipped gym, where modern fitness meets the comfort of your stay.",
    description:
      "## Wellness at Rivana Residence\n\nStay energized and refreshed at our fully equipped gym, where modern fitness meets the comfort of your stay.\n\n“Maintain your routine with ease at our state-of-the-art gym, designed to keep you active and energized throughout your stay.”",
    openingHoursText: "Daily, 06:00–22:30",
    featured: true,
    hero: "gym",
    gallery: ["gym02", "gym04", "gym03", "gym05"],
  },
  {
    name: "Café",
    slug: "cafe",
    shortDescription:
      "Savor delightful flavors and relaxing moments at Rivana Residence Café.",
    description:
      "Savor delightful flavors and relaxing moments at Rivana Residence Café, the perfect spot to enjoy coffee, snacks, and casual gatherings.",
    openingHoursText: null,
    featured: false,
    hero: null,
    gallery: [],
  },
];

export type SectionEdit = Readonly<{
  heading?: string | null;
  eyebrow?: string | null;
  isVisible?: boolean;
  payload?: Record<string, unknown>;
  text?: string;
  image?: Readonly<{
    role: "BACKGROUND" | "PRIMARY" | "GALLERY";
    keys: readonly ImageKey[];
  }>;
}>;

export type PageSeed = Readonly<Record<string, SectionEdit>>;

const CONTACT_BODY =
  "Our team is here to help with your stay, personal requests, or any enquiry.";

export const PAGES: Readonly<Record<"HOME" | "ABOUT" | "CONTACT", PageSeed>> = {
  HOME: {
    HERO: {
      eyebrow: "Living your experience with Rivana Residence",
      payload: {
        title: "Rivana Residence",
        summary: "Luxury is a state of mind, and here, it's our reality.",
        cta: { label: "Explore our rooms", intent: "ROOMS" },
      },
      image: { role: "BACKGROUND", keys: ["homeHero"] },
    },
    RICH_TEXT: {
      eyebrow: "Welcome",
      heading: "Rivana Residence",
      text: "We at Rivana Residence are pleased to welcome you to our network of distinguished guests. We look forward to a fruitful and constructive collaboration while staying at one of the finest hospitality destinations in New Cairo.",
    },
    ROOM_GRID: {
      eyebrow: "Enchanted with elegance",
      heading: "Our rooms",
      payload: { limit: 3, featuredOnly: false },
    },
    FACILITY_GRID: {
      eyebrow: "Life at Rivana Residence",
      heading: "Amenities",
      payload: { limit: 3, featuredOnly: false },
    },
    IMAGE_TEXT_SPLIT: {
      eyebrow: "Your stay",
      heading: "Rest well. Sleep well.",
      isVisible: true,
      text: "We are confident in delivering this unique experience to you and your valued guests in the Fifth Settlement, New Cairo.",
      payload: {
        imageSide: "RIGHT",
        cta: { label: "View all rooms", intent: "ROOMS" },
      },
      image: { role: "PRIMARY", keys: ["twin1"] },
    },
    CONTACT_CTA: {
      eyebrow: "Make your stay memorable",
      heading: "Have any questions?",
      payload: { body: CONTACT_BODY, formEnabled: true },
    },
  },
  ABOUT: {
    HERO: {
      eyebrow: "Welcome to Rivana Residence",
      payload: {
        title: "About Rivana",
        summary: "Make your stay memorable.",
      },
      image: { role: "BACKGROUND", keys: ["exteriorWide"] },
    },
    IMAGE_TEXT_SPLIT: {
      eyebrow: "Make your stay memorable",
      heading: "More than just a hotel",
      text: "We at Rivana Residence are pleased to welcome you to our network of distinguished guests. We look forward to a fruitful and constructive collaboration while staying at one of the finest hospitality destinations in New Cairo, located opposite the American University and El Zohour Club.\n\nRivana Residence combines luxury, comfort, and a strategic location, making it the ideal choice for business and leisure travelers. We are confident in delivering this unique experience to you and your valued guests in the Fifth Settlement, New Cairo.\n\n“Rivana Residence is more than just a hotel — it's a haven of comfort, style, and hospitality, designed to blend modern elegance with a welcoming atmosphere.”",
      payload: { imageSide: "LEFT" },
      image: { role: "PRIMARY", keys: ["exterior"] },
    },
    STATS: {
      isVisible: true,
      heading: "At a glance",
      payload: {
        items: [
          { value: "28", label: "Rooms" },
          { value: "30", label: "Staff" },
          { value: "1", label: "Location" },
        ],
      },
    },
    GALLERY: {
      isVisible: true,
      eyebrow: "Gallery",
      heading: "Around the residence",
      payload: { layout: "EDITORIAL" },
      image: {
        role: "GALLERY",
        keys: ["homeWelcome", "pool03", "gym", "twin8"],
      },
    },
    ROOM_GRID: {
      isVisible: true,
      eyebrow: "Enchanted with elegance",
      heading: "Our rooms",
      payload: { limit: 3, featuredOnly: false },
    },
    CONTACT_CTA: {
      eyebrow: "Make your stay memorable",
      heading: "Have any questions?",
      payload: { body: CONTACT_BODY, formEnabled: false },
    },
  },
  CONTACT: {
    HERO: {
      eyebrow: "Stay with us in comfort",
      payload: {
        title: "Contact us",
        summary:
          "Every detail of your stay matters at Rivana Residence. Our dedicated team is at your service to assist with reservations, personalized requests, or any inquiries you may have.",
      },
    },
    CONTACT_CTA: {
      eyebrow: "Enquiries",
      heading: "Send us a message",
      payload: {
        body: "Contact us, and allow us to craft a seamless experience defined by comfort, elegance, and exceptional hospitality.",
        formEnabled: true,
      },
    },
  },
};
