import { getCountries, getCountryCallingCode } from "libphonenumber-js/min";

import type { PhoneCountry } from "@/presentation/features/booking/guest-details-form";

/** Built on the server so the list costs the browser no script. */
export function phoneCountries(): PhoneCountry[] {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  return getCountries()
    .map((code) => ({
      code,
      label: `${names.of(code) ?? code} (+${getCountryCallingCode(code)})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "en"));
}
