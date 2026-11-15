import { DomainValidationError } from "@/domain/shared/domain-error";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PATTERN = /^RR-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;
const invalid = () =>
  new DomainValidationError("The reservation reference is invalid.", [
    {
      path: "reference",
      message: "Use RR- followed by eight Crockford characters.",
    },
  ]);

export class ReservationReference {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }
  static parse(raw: unknown): ReservationReference {
    if (typeof raw !== "string" || raw.length > 32) throw invalid();
    const text = raw
      .trim()
      .replace(/[a-z]/g, (character) => character.toUpperCase());
    // Crockford lookup aliases only; generation always uses the canonical alphabet.
    const value =
      text.slice(0, 3) + text.slice(3).replace(/[IL]/g, "1").replace(/O/g, "0");
    if (!PATTERN.test(value)) throw invalid();
    return new ReservationReference(value);
  }
  /** Eight uniformly random bytes yield eight unbiased base32 symbols (256 divides by 32). */
  static fromRandomBytes(bytes: Uint8Array): ReservationReference {
    if (!(bytes instanceof Uint8Array) || bytes.length !== 8) throw invalid();
    return new ReservationReference(
      `RR-${Array.from(bytes, (byte) => ALPHABET[byte & 31]).join("")}`,
    );
  }
  equals(other: ReservationReference): boolean {
    return this.value === other.value;
  }
}
