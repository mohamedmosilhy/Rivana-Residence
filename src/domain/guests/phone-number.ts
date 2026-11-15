import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { DomainValidationError } from "@/domain/shared/domain-error";

export const PHONE_INPUT_MAX = 40;
export class PhoneNumber {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }
  static parse(raw: unknown): PhoneNumber {
    const invalid = () =>
      new DomainValidationError("The phone number is invalid.", [
        {
          path: "phone",
          message:
            "Enter a valid international phone number without an extension.",
        },
      ]);
    if (
      typeof raw !== "string" ||
      raw.length > PHONE_INPUT_MAX ||
      /[\p{Cc}\p{Cf}]/u.test(raw)
    )
      throw invalid();
    const input = raw.trim();
    if (!input.startsWith("+")) throw invalid();
    const parsed = parsePhoneNumberFromString(input, { extract: false });
    if (!parsed || parsed.ext || !parsed.isValid()) throw invalid();
    return new PhoneNumber(parsed.number);
  }
  equals(other: PhoneNumber): boolean {
    return this.value === other.value;
  }
}
