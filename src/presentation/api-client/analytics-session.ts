// The anonymous website visit id (ADR 029): 128 random bits kept for this tab
// only. No cookie, and nothing at all when the browser asks not to be tracked.

const STORAGE_KEY = "rivana.analytics.session";
const VALID = /^[0-9a-f]{32}$/;

function trackingRefused() {
  const browser = navigator as Navigator & { globalPrivacyControl?: boolean };
  return browser.globalPrivacyControl === true || browser.doNotTrack === "1";
}

/** Null on the server, under GPC or DNT, and when storage is blocked. */
export function analyticsSessionId(): string | null {
  // Reading storage throws in some privacy modes. A booking never depends on
  // this value, so any failure means "no id".
  try {
    if (typeof window === "undefined") return null;
    const storage = window.sessionStorage;
    if (trackingRefused()) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    const stored = storage.getItem(STORAGE_KEY);
    if (stored && VALID.test(stored)) return stored;
    // `randomUUID` needs a secure context; `getRandomValues` does not.
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    storage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return null;
  }
}
