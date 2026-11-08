import { describe, expect, it } from "vitest";

import { resolveSeedOptions } from "../../../prisma/seed/options";

describe("seed options (SEED-2)", () => {
  it("runs the real seed only when no flag is given, in any environment", () => {
    expect(resolveSeedOptions([], {})).toEqual({ demo: false });
    expect(resolveSeedOptions([], { NODE_ENV: "production" })).toEqual({
      demo: false,
    });
  });

  it("allows --demo outside production", () => {
    for (const NODE_ENV of [undefined, "development", "test"]) {
      expect(resolveSeedOptions(["--demo"], { NODE_ENV })).toEqual({
        demo: true,
      });
    }
  });

  it("refuses --demo in production", () => {
    expect(() =>
      resolveSeedOptions(["--demo"], { NODE_ENV: "production" }),
    ).toThrow(/Refusing --demo in production/);
  });

  it("refuses an unknown flag instead of ignoring a typo", () => {
    expect(() => resolveSeedOptions(["--demos"], {})).toThrow(
      /Unknown seed option: --demos/,
    );
    expect(() => resolveSeedOptions(["--demo", "--activate-giza"], {})).toThrow(
      /Unknown seed option/,
    );
  });

  it("also refuses --demo when APP_URL points away from this machine", () => {
    for (const APP_URL of [
      "https://rivanaresidence.com",
      "https://staging.rivanaresidence.com",
      "http://203.0.113.10:3000",
      "not a url",
    ]) {
      expect(() => resolveSeedOptions(["--demo"], { APP_URL })).toThrow(
        /APP_URL does not point at this machine/,
      );
    }
  });

  it("allows --demo for a local APP_URL, or none", () => {
    for (const APP_URL of [
      undefined,
      "http://localhost:3000",
      "http://127.0.0.1:3100",
      "http://[::1]:3000",
    ]) {
      expect(resolveSeedOptions(["--demo"], { APP_URL })).toEqual({
        demo: true,
      });
    }
  });

  it("does not look at APP_URL for the real seed", () => {
    expect(
      resolveSeedOptions([], { APP_URL: "https://rivanaresidence.com" }),
    ).toEqual({ demo: false });
  });
});
