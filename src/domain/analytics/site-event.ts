import { isReservedBranchSlug } from "@/domain/branches";
import { SLUG_PATTERN } from "@/domain/shared/slug";

export type SiteEventName =
  | "PAGE_VIEW"
  | "STEP_VIEW"
  | "SEARCH"
  | "QUOTE"
  | "CODE_REQUESTED"
  | "PHONE_VERIFIED"
  | "BOOKING_SUBMITTED"
  | "BOOKING_CONFIRMED"
  | "CHECKOUT_REFUSED";

export type BookingStep =
  | "SEARCH"
  | "DETAILS"
  | "VERIFY"
  | "EXTRAS"
  | "PAYMENT"
  | "REVIEW"
  | "CONFIRMED"
  | "PAYMENT_RETURN"
  | "MANAGE"
  | "FIND"
  | "CHANGE";

export type BrowserSiteEvent = Readonly<{
  path: string;
  branchSlug?: string | undefined;
  roomSlug?: string | undefined;
  referrer?: string | undefined;
  utm?:
    | Readonly<{
        source?: string | undefined;
        medium?: string | undefined;
        campaign?: string | undefined;
      }>
    | undefined;
}> &
  (
    | Readonly<{ name: "PAGE_VIEW"; step?: never }>
    | Readonly<{ name: "STEP_VIEW"; step: BookingStep }>
  );

const BRAND_PATHS = new Set([
  "/",
  "/reservations/manage",
  "/reservations/find",
]);
const BRANCH_PATHS = new Set([
  "",
  "about",
  "contact",
  "facilities",
  "stay",
  "book",
  "book/details",
  "book/confirmed",
  "book/payment",
]);

export function publicPage(path: string) {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return null;
  const clean = pathname === "/" ? "/" : pathname.replace(/\/$/, "");
  if (BRAND_PATHS.has(clean)) {
    return { path: clean, branchSlug: null, roomSlug: null };
  }
  const [branchSlug, ...rest] = clean.slice(1).split("/");
  if (
    !branchSlug ||
    !SLUG_PATTERN.test(branchSlug) ||
    isReservedBranchSlug(branchSlug)
  )
    return null;
  const tail = rest.join("/");
  if (BRANCH_PATHS.has(tail)) {
    return {
      path: tail ? `/{branch}/${tail}` : "/{branch}",
      branchSlug,
      roomSlug: null,
    };
  }
  const [section, slug] = rest;
  if (rest.length !== 2 || !slug || !SLUG_PATTERN.test(slug)) return null;
  if (section === "stay") {
    return { path: "/{branch}/stay/[slug]", branchSlug, roomSlug: slug };
  }
  if (section === "facilities") {
    return { path: "/{branch}/facilities/[slug]", branchSlug, roomSlug: null };
  }
  return null;
}

const REFERRER_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "bing.com",
  "www.bing.com",
  "duckduckgo.com",
  "www.facebook.com",
  "facebook.com",
  "m.facebook.com",
  "l.facebook.com",
  "instagram.com",
  "www.instagram.com",
  "l.instagram.com",
]);
const TRAFFIC_SOURCES = new Set([
  "google",
  "bing",
  "duckduckgo",
  "facebook",
  "instagram",
]);
const TRAFFIC_MEDIA = new Set([
  "organic",
  "referral",
  "social",
  "email",
  "cpc",
]);
const CAMPAIGN_LABELS: ReadonlySet<string> = new Set();

function approvedLabel(value: string | undefined, labels: ReadonlySet<string>) {
  const label = value?.trim().toLowerCase();
  return label && label.length <= 60 && labels.has(label) ? label : null;
}

function referrerHost(referrer: string | undefined) {
  if (!referrer || referrer.length > 2048) return null;
  try {
    const url = new URL(referrer);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password &&
      REFERRER_HOSTS.has(url.hostname)
      ? url.hostname
      : null;
  } catch {
    return null;
  }
}

export function trafficLabels(event: BrowserSiteEvent) {
  return {
    referrerHost: referrerHost(event.referrer),
    utmSource: approvedLabel(event.utm?.source, TRAFFIC_SOURCES),
    utmMedium: approvedLabel(event.utm?.medium, TRAFFIC_MEDIA),
    utmCampaign: approvedLabel(event.utm?.campaign, CAMPAIGN_LABELS),
  };
}

export type Device = "MOBILE" | "TABLET" | "DESKTOP";

export function deviceFor(userAgent: string): Device {
  if (/ipad|tablet|kindle|silk|playbook|android(?!.*mobile)/i.test(userAgent))
    return "TABLET";
  if (/mobi|iphone|ipod|android/i.test(userAgent)) return "MOBILE";
  return "DESKTOP";
}

export function omitSiteEvent(headers: Headers) {
  const userAgent = headers.get("user-agent") ?? "";
  return (
    headers.get("sec-gpc") === "1" ||
    headers.get("dnt") === "1" ||
    headers.has("next-router-prefetch") ||
    headers.has("next-router-segment-prefetch") ||
    [headers.get("purpose"), headers.get("sec-purpose")].some((value) =>
      /(?:^|[\s;,])prefetch(?:$|[\s;,])/i.test(value ?? ""),
    ) ||
    /bot|spider|crawler|slurp|facebookexternalhit|preview|headlesschrome|curl\//i.test(
      userAgent,
    )
  );
}
