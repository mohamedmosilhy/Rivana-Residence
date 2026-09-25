// @vitest-environment node
import { describe, expect, it } from "vitest";

import { isSameOriginRequest } from "@/composition/media";

// APP_URL defaults to http://localhost:3000 in the test environment.
function request(headers: Record<string, string>) {
  return new Request("http://localhost:3000/admin/media/upload", {
    method: "POST",
    headers,
  });
}

describe("upload origin check (CSRF)", () => {
  it("accepts a same-origin browser request", () => {
    expect(
      isSameOriginRequest(
        request({
          Origin: "http://localhost:3000",
          "Sec-Fetch-Site": "same-origin",
        }),
      ),
    ).toBe(true);
    expect(
      isSameOriginRequest(request({ Origin: "http://localhost:3000" })),
    ).toBe(true);
  });

  it.each([
    [{ Origin: "https://evil.example" }],
    [{ Origin: "http://localhost:3000.evil.example" }],
    [{ Origin: "null" }],
    [{}],
    [{ Origin: "http://localhost:3000", "Sec-Fetch-Site": "cross-site" }],
    [{ Origin: "http://localhost:3000", "Sec-Fetch-Site": "same-site" }],
  ])("refuses %o", (headers) => {
    expect(isSameOriginRequest(request(headers))).toBe(false);
  });
});
