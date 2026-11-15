import { describe, expect, it } from "vitest";
import {
  PhoneNumber,
  parseGuestContact,
  parseGuestBlockReason,
  guestPhoneVerifiedAt,
  canReadReservationContact,
} from "@/domain/guests";
import { DomainValidationError } from "@/domain/shared/domain-error";

const contact = {
  fullName: " Fictional Guest ",
  email: " Guest@Example.Test ",
  phone: "+20 100 123 4567",
  country: "eg",
  specialRequests: " Quiet room ",
};
describe("T-PHONE and T-VAL guest values", () => {
  it("normalizes international formatting and compares by E.164", () => {
    const number = PhoneNumber.parse(" +20 100 123 4567 ");
    expect(number.value).toBe("+201001234567");
    expect(number.equals(PhoneNumber.parse("+201001234567"))).toBe(true);
    expect(Object.isFrozen(number)).toBe(true);
    expect(PhoneNumber.parse("+1 (202) 555-0101").value).toBe("+12025550101");
  });
  it.each([
    null,
    1,
    "",
    "01001234567",
    "00201001234567",
    "+99912345678",
    "+201",
    "+1 111 111 1111",
    "Call +201001234567",
    "+201001234567 ext 12",
    "+201001234567;ext=12",
    "+201001234567\n",
    "+20\u200b1001234567",
    "+" + "1".repeat(41),
  ])("rejects invalid or ambiguous phone %j without echoing it", (raw) => {
    try {
      PhoneNumber.parse(raw);
      throw new Error("Expected refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainValidationError);
      expect((error as Error).message).toBe("The phone number is invalid.");
    }
  });
  it("normalizes bounded guest contact without mutating the input", () => {
    const raw = Object.freeze({ ...contact });
    const result = parseGuestContact(raw);
    expect(result).toMatchObject({
      fullName: "Fictional Guest",
      email: "guest@example.test",
      country: "EG",
      specialRequests: "Quiet room",
    });
    expect(result.phone?.value).toBe("+201001234567");
    expect(raw.fullName).toBe(" Fictional Guest ");
    expect(Object.isFrozen(result)).toBe(true);
    expect(parseGuestContact({ fullName: "Staff guest" })).toMatchObject({
      email: null,
      phone: null,
      country: null,
      specialRequests: null,
    });
  });
  it.each([
    { fullName: " " },
    { fullName: "a".repeat(121) },
    { email: "bad" },
    { email: "a".repeat(321) },
    { country: "EGY" },
    { specialRequests: "a".repeat(1001) },
    { fullName: "Guest\nInjected" },
    { email: "guest@example.test\r\n" },
    { specialRequests: "Room\u0000" },
    { priceMinor: 1 },
  ])("rejects invalid guest field %j", (patch) => {
    expect(() => parseGuestContact({ ...contact, ...patch })).toThrow(
      DomainValidationError,
    );
  });
  it("accepts the exact name and request boundaries and requires a bounded block reason", () => {
    expect(
      parseGuestContact({
        ...contact,
        fullName: "a".repeat(120),
        specialRequests: "a".repeat(1000),
      }).fullName.length,
    ).toBe(120);
    expect(parseGuestBlockReason(" reason ")).toBe("reason");
    expect(parseGuestBlockReason("a".repeat(500))).toHaveLength(500);
    for (const reason of [" ", "a".repeat(501), "reason\n", null])
      expect(() => parseGuestBlockReason(reason)).toThrow(
        DomainValidationError,
      );
  });
  it("GV-5 never marks staff or external entry as phone verification", () => {
    const proof = new Date("2026-11-15T00:00:00Z");
    for (const source of ["STAFF", "EXTERNAL"] as const) {
      expect(guestPhoneVerifiedAt(source, null, proof)).toBeNull();
      const preserved = guestPhoneVerifiedAt(source, proof, null);
      expect(preserved).toEqual(proof);
      expect(preserved).not.toBe(proof);
    }
    expect(guestPhoneVerifiedAt("WEBSITE", null, proof)).toEqual(proof);
    expect(() => guestPhoneVerifiedAt("WEBSITE", null, null)).toThrow(
      DomainValidationError,
    );
  });
  it("R-8 scopes contact grants and Q-75 blocks sessions without invalidating the manage link", () => {
    const phone = PhoneNumber.parse("+12025550101"),
      other = PhoneNumber.parse("+12025550102");
    expect(
      canReadReservationContact({ kind: "NONE" }, "booking", phone, false),
    ).toBe(false);
    expect(
      canReadReservationContact(
        { kind: "MANAGE_TOKEN", reservationId: "other" },
        "booking",
        phone,
        false,
      ),
    ).toBe(false);
    expect(
      canReadReservationContact(
        { kind: "MANAGE_TOKEN", reservationId: "booking" },
        "booking",
        phone,
        true,
      ),
    ).toBe(true);
    expect(
      canReadReservationContact(
        { kind: "GUEST_SESSION", phone: other },
        "booking",
        phone,
        false,
      ),
    ).toBe(false);
    expect(
      canReadReservationContact(
        { kind: "GUEST_SESSION", phone },
        "booking",
        phone,
        false,
      ),
    ).toBe(true);
    expect(
      canReadReservationContact(
        { kind: "GUEST_SESSION", phone },
        "booking",
        phone,
        true,
      ),
    ).toBe(false);
    expect(
      canReadReservationContact(
        { kind: "GUEST_SESSION", phone },
        "booking",
        null,
        false,
      ),
    ).toBe(false);
  });
});
