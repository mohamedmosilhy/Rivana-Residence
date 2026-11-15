import { describe, expect, it } from "vitest";
import { ReservationReference } from "@/domain/reservations";
import { DomainValidationError } from "@/domain/shared/domain-error";

describe("T-REF reservation references", () => {
  it("encodes eight supplied bytes into the exact Crockford alphabet without modifying them", () => {
    const symbols = new Set<string>();
    for (let byte = 0; byte < 256; byte++) {
      const bytes = new Uint8Array(8).fill(byte);
      const ref = ReservationReference.fromRandomBytes(bytes);
      expect(ref.value).toMatch(/^RR-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
      expect(bytes).toEqual(new Uint8Array(8).fill(byte));
      symbols.add(ref.value[3]!);
    }
    expect(symbols.size).toBe(32);
    expect(
      ReservationReference.fromRandomBytes(
        new Uint8Array([0, 1, 2, 3, 4, 5, 30, 31]),
      ).value,
    ).toBe("RR-012345YZ");
  });
  it("normalizes ASCII case and Crockford lookup aliases, and supports equality", () => {
    const value = ReservationReference.parse(" rr-ooilooil ");
    expect(value.value).toBe("RR-00110011");
    expect(value.equals(ReservationReference.parse("RR-00110011"))).toBe(true);
    expect(Object.isFrozen(value)).toBe(true);
  });
  it.each([
    null,
    1,
    "",
    "RR-1234567",
    "RR-123456789",
    "XX-12345678",
    "RR-1234567U",
    "RR-１２３４５６７８",
    "RR-1234 678",
    "rR-12345678\nextra",
  ])("rejects invalid reference %j", (value) => {
    expect(() => ReservationReference.parse(value)).toThrow(
      DomainValidationError,
    );
  });
  it.each([0, 5, 7, 9])("rejects a random buffer of length %s", (size) => {
    expect(() =>
      ReservationReference.fromRandomBytes(new Uint8Array(size)),
    ).toThrow(DomainValidationError);
  });
});
