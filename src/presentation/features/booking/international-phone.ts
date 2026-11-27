import type { CountryCode } from "libphonenumber-js/min";

// The phone library is downloaded only when the guest uses the phone field, so
// it does not weigh on the first page load. The server checks the number again.

export const loadPhoneLibrary = () => import("libphonenumber-js/min");

export type InternationalPhone =
  | Readonly<{ ok: true; phone: string }>
  | Readonly<{ ok: false; reason: "INVALID" | "UNAVAILABLE" }>;

/** The E.164 form of a national number, or of a number starting with +. */
export async function toInternationalPhone(
  input: string,
  country: string,
): Promise<InternationalPhone> {
  let library: Awaited<ReturnType<typeof loadPhoneLibrary>>;
  try {
    library = await loadPhoneLibrary();
  } catch {
    return { ok: false, reason: "UNAVAILABLE" };
  }
  const parsed = library.parsePhoneNumberFromString(input, {
    defaultCountry: country as CountryCode,
    extract: false,
  });
  // `isPossible` checks the length only: the server decides validity with the
  // full metadata, so a real number is never refused by the smaller set here.
  return !parsed || parsed.ext || !parsed.isPossible()
    ? { ok: false, reason: "INVALID" }
    : { ok: true, phone: parsed.number };
}
