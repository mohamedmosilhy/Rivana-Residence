import {
  applyChange,
  confirmVerification,
  createReservation,
  getGuestReservation,
  listGuestReservations,
  previewChange,
  requestCancellation,
  requestQuote,
  requestVerification,
  searchAvailability,
  type ApiResult,
  type ApiSuccess,
  type BookingInput,
  type GuestAccess,
  type QuoteInput,
} from "@/presentation/api-client";

// One entry per client call, shared by the request and OpenAPI tests.

export const TOKEN = "t".repeat(43);
export const link: GuestAccess = { kind: "MANAGE_LINK", token: TOKEN };
export const signedIn: GuestAccess = {
  kind: "SESSION",
  token: TOKEN,
  reference: "RR-ABCD2345",
};

export const stay = { checkIn: "2031-04-10", checkOut: "2031-04-12" };
export const search = { ...stay, adults: "2", children: "0" };
export const quote: QuoteInput = {
  branchSlug: "new-cairo",
  stay,
  lines: [{ roomSlug: "deluxe", occupancy: { adults: 2, children: 0 } }],
  services: [],
};
export const total = { amountMinor: 34_500, currency: "USD" as const };
export const booking: BookingInput = {
  ...quote,
  guest: {
    fullName: "Fictional Guest",
    email: "guest@example.test",
    phone: "+12025550101",
  },
  phoneVerificationToken: TOKEN,
  paymentMethod: "PAY_AT_HOTEL",
  expectedTotal: total,
  consent: { privacyNoticeVersion: "v1" },
};
export const change = { guest: { fullName: "Another Name" } };

type Call = Readonly<{
  name: string;
  run: () => Promise<ApiResult<ApiSuccess<number, unknown>>>;
  method: "GET" | "POST";
  url: string;
  /** The OpenAPI path template. */
  template: string;
  statuses: readonly number[];
  body?: unknown;
  guest?: boolean;
  tracked?: boolean;
}>;

const base = "/api/v1";
const mine = `${base}/guest/reservation`;
const listed = `${base}/guest/reservations`;
const one = `${listed}/RR-ABCD2345`;
const template = `${listed}/{reference}`;

export const CALLS: readonly Call[] = [
  {
    name: "P5 search",
    run: () => searchAvailability("new-cairo", search),
    method: "GET",
    url: `${base}/branches/new-cairo/availability?checkIn=2031-04-10&checkOut=2031-04-12&adults=2&children=0`,
    template: `${base}/branches/{branchSlug}/availability`,
    statuses: [200],
    tracked: true,
  },
  {
    name: "P6 quote",
    run: () => requestQuote(quote),
    method: "POST",
    url: `${base}/quotes`,
    template: `${base}/quotes`,
    statuses: [200],
    body: quote,
    tracked: true,
  },
  {
    name: "P9 send a code",
    run: () =>
      requestVerification({ phone: "+12025550101", purpose: "BOOKING" }),
    method: "POST",
    url: `${base}/phone-verifications`,
    template: `${base}/phone-verifications`,
    statuses: [201],
    body: { phone: "+12025550101", purpose: "BOOKING" },
    tracked: true,
  },
  {
    name: "P10 confirm a code",
    run: () => confirmVerification("ver1", { code: "123456" }),
    method: "POST",
    url: `${base}/phone-verifications/ver1/confirmation`,
    template: `${base}/phone-verifications/{verificationId}/confirmation`,
    statuses: [200],
    body: { code: "123456" },
    tracked: true,
  },
  {
    name: "P7 book",
    run: () => createReservation(booking, "key-12345678"),
    method: "POST",
    url: `${base}/reservations`,
    template: `${base}/reservations`,
    statuses: [200, 201],
  },
  {
    name: "G1 view by link",
    run: () => getGuestReservation(link),
    method: "GET",
    url: mine,
    template: mine,
    statuses: [200],
    guest: true,
  },
  {
    name: "G4 view by session",
    run: () => getGuestReservation(signedIn),
    method: "GET",
    url: one,
    template,
    statuses: [200],
    guest: true,
  },
  {
    name: "G3 list",
    run: () => listGuestReservations(TOKEN),
    method: "GET",
    url: listed,
    template: listed,
    statuses: [200],
    guest: true,
  },
  {
    name: "G2 cancel by link",
    run: () => requestCancellation(link, { reason: "Plans changed" }),
    method: "POST",
    url: `${mine}/cancellation-requests`,
    template: `${mine}/cancellation-requests`,
    statuses: [201],
    body: { reason: "Plans changed" },
    guest: true,
  },
  {
    name: "G4 cancel by session",
    run: () => requestCancellation(signedIn, {}),
    method: "POST",
    url: `${one}/cancellation-requests`,
    template: `${template}/cancellation-requests`,
    statuses: [201],
    body: {},
    guest: true,
  },
  {
    name: "G5 preview by link",
    run: () => previewChange(link, change),
    method: "POST",
    url: `${mine}/change-preview`,
    template: `${mine}/change-preview`,
    statuses: [200],
    body: change,
    guest: true,
  },
  {
    name: "G5 preview by session",
    run: () => previewChange(signedIn, {}),
    method: "POST",
    url: `${one}/change-preview`,
    template: `${template}/change-preview`,
    statuses: [200],
    body: {},
    guest: true,
  },
  {
    name: "G6 change by link",
    run: () => applyChange(link, '"v3"', { ...change, expectedTotal: total }),
    method: "POST",
    url: `${mine}/changes`,
    template: `${mine}/changes`,
    statuses: [200, 202],
    body: { ...change, expectedTotal: total },
    guest: true,
  },
  {
    name: "G6 change by session",
    run: () => applyChange(signedIn, '"v3"', { expectedTotal: total }),
    method: "POST",
    url: `${one}/changes`,
    template: `${template}/changes`,
    statuses: [200, 202],
    body: { expectedTotal: total },
    guest: true,
  },
];
