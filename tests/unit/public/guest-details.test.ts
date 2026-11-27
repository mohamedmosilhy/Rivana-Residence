import { describe, expect, it, vi } from "vitest";

import {
  GUEST_FIELD_LIMITS,
  parseGuestContact,
  parseGuestEmail,
  PHONE_INPUT_MAX,
  PhoneNumber,
} from "@/domain/guests";
import {
  clearDraft,
  draftKey,
  readDraft,
  saveDraft,
} from "@/presentation/features/booking/booking-draft";
import {
  checkGuestDetails,
  emptyGuestDetails,
  GUEST_INPUT_LIMITS,
  normalizeGuestDetails,
} from "@/presentation/features/booking/guest-details";
import { toInternationalPhone } from "@/presentation/features/booking/international-phone";

const valid = {
  fullName: "Amina Hassan",
  email: "amina@example.test",
  country: "EG",
  phone: "010 0123 4567",
  specialRequests: "",
};
const accepted = (run: () => unknown) => {
  try {
    run();
    return true;
  } catch {
    return false;
  }
};

describe("guest detail checks", () => {
  it("keeps the server's limits", () => {
    expect(GUEST_INPUT_LIMITS.fullName).toBe(GUEST_FIELD_LIMITS.fullName);
    expect(GUEST_INPUT_LIMITS.specialRequests).toBe(
      GUEST_FIELD_LIMITS.specialRequests,
    );
    expect(GUEST_INPUT_LIMITS.email).toBeLessThanOrEqual(
      GUEST_FIELD_LIMITS.email,
    );
    expect(GUEST_INPUT_LIMITS.phone).toBe(PHONE_INPUT_MAX);
  });

  it.each([
    "amina@example.test",
    "A.b+c_d'e-f@sub.example.co",
    "amina@example",
    "amina@@example.test",
    ".amina@example.test",
    "amina.@example.test",
    "am..ina@example.test",
    "amina@-example.test",
    "amina @example.test",
    "أمينة@example.test",
    "amina@example.t",
    "plain",
  ])("agrees with the server about the email %j", (email) => {
    expect(!checkGuestDetails({ ...valid, email }).email).toBe(
      accepted(() => parseGuestEmail(email)),
    );
  });

  it("requires the name, email and phone only", () => {
    expect(Object.keys(checkGuestDetails(emptyGuestDetails))).toEqual([
      "fullName",
      "email",
      "phone",
    ]);
    expect(checkGuestDetails(valid)).toEqual({});
  });

  it("refuses overlong values and hidden characters", () => {
    expect(
      Object.keys(
        checkGuestDetails({
          ...valid,
          fullName: "a".repeat(121),
          email: `${"a".repeat(250)}@x.test`,
          specialRequests: "a".repeat(1001),
        }),
      ),
    ).toEqual(["fullName", "email", "specialRequests"]);
    expect(
      checkGuestDetails({ ...valid, fullName: "Amina‮Hassan" }).fullName,
    ).toBeTruthy();
  });

  it("turns line breaks in requests into spaces the server accepts", () => {
    const details = normalizeGuestDetails({
      ...valid,
      fullName: "  Amina Hassan ",
      specialRequests: "Late arrival\r\n\r\nQuiet room\tplease\n",
    });
    expect(details.fullName).toBe("Amina Hassan");
    expect(details.specialRequests).toBe("Late arrival Quiet room please");
    expect(checkGuestDetails(details)).toEqual({});
    expect(
      accepted(() =>
        parseGuestContact({
          fullName: details.fullName,
          email: details.email,
          specialRequests: details.specialRequests,
        }),
      ),
    ).toBe(true);
  });
});

describe("international phone", () => {
  it.each([
    ["010 0123 4567", "EG", "+201001234567"],
    ["(202) 555-0101", "US", "+12025550101"],
    // Italy keeps its leading zero.
    ["06 6982 1234", "IT", "+390669821234"],
    ["+44 20 7946 0958", "EG", "+442079460958"],
    ["٠١٠٠١٢٣٤٥٦٧", "EG", "+201001234567"],
  ])("reads %j in %s as the server would", async (input, country, phone) => {
    await expect(toInternationalPhone(input, country)).resolves.toEqual({
      ok: true,
      phone,
    });
    expect(PhoneNumber.parse(phone).value).toBe(phone);
  });

  it.each(["12", "call me", "010 0123 4567 ext. 5", "+0"])(
    "refuses %j",
    async (input) => {
      await expect(toInternationalPhone(input, "EG")).resolves.toEqual({
        ok: false,
        reason: "INVALID",
      });
    },
  );
});

describe("booking draft", () => {
  const countries = ["EG", "US"];

  it("keeps the five typed fields for one branch and nothing else", () => {
    const details = { ...valid, country: "US" };
    saveDraft("new-cairo", {
      ...details,
      ...({ token: "secret", code: "123456" } as object),
    });
    expect(
      Object.keys(
        JSON.parse(sessionStorage.getItem(draftKey("new-cairo"))!) as object,
      ),
    ).toEqual(["fullName", "email", "country", "phone", "specialRequests"]);
    expect(readDraft("new-cairo", countries)).toEqual(details);
    expect(readDraft("giza", countries)).toEqual(emptyGuestDetails);
    clearDraft("new-cairo");
    expect(sessionStorage.length).toBe(0);
  });

  it.each(["not json", "null", "7", '"text"'])(
    "ignores the stored value %j",
    (stored) => {
      sessionStorage.setItem(draftKey("new-cairo"), stored);
      expect(readDraft("new-cairo", countries)).toEqual(emptyGuestDetails);
      sessionStorage.clear();
    },
  );

  it("clips long values and drops unknown countries and other types", () => {
    sessionStorage.setItem(
      draftKey("new-cairo"),
      JSON.stringify({
        fullName: "a".repeat(500),
        email: 4,
        country: "ZZ",
        token: "secret",
      }),
    );
    expect(readDraft("new-cairo", countries)).toEqual({
      ...emptyGuestDetails,
      fullName: "a".repeat(120),
    });
    sessionStorage.clear();
  });

  it("works without storage", () => {
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    const spies = (["getItem", "setItem", "removeItem"] as const).map((name) =>
      vi.spyOn(Storage.prototype, name).mockImplementation(blocked),
    );
    expect(() => saveDraft("new-cairo", valid)).not.toThrow();
    expect(() => clearDraft("new-cairo")).not.toThrow();
    expect(readDraft("new-cairo", countries)).toEqual(emptyGuestDetails);
    spies.forEach((spy) => spy.mockRestore());
  });
});
