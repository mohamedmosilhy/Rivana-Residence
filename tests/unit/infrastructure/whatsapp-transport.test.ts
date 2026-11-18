// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { WhatsAppDelivery } from "@/application/notifications";
import { PhoneNumber } from "@/domain/guests";
import {
  FAKE_WHATSAPP_REJECTED_NUMBER,
  FakeWhatsAppTransport,
} from "@/infrastructure/whatsapp/fake-transport";
import { MetaCloudWhatsAppTransport } from "@/infrastructure/whatsapp/meta-cloud-transport";
import { sanitizeProviderText } from "@/infrastructure/whatsapp/sanitize";

// M8-T4: the Meta Cloud API transport over an injected fetch, the fake, and
// the sanitizer that keeps tokens, phones, and codes out of stored errors.

const TOKEN = "EAAG-super-secret-token-value";
const PHONE = "+12025550101";

const delivery = (
  overrides: Partial<WhatsAppDelivery> = {},
): WhatsAppDelivery => ({
  phoneNumberId: "1098765432",
  templateName: "booking_confirmed_v1",
  language: "en",
  category: "UTILITY",
  to: PhoneNumber.parse(PHONE),
  parameters: ["Mona", "RIV-123"],
  ...overrides,
});

function transport(response: () => Promise<Response> | Response) {
  const fetch = vi.fn(async () => response());
  return {
    fetch,
    meta: new MetaCloudWhatsAppTransport({
      accessToken: TOKEN,
      graphVersion: "v23.0",
      fetch: fetch as unknown as typeof globalThis.fetch,
    }),
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("MetaCloudWhatsAppTransport", () => {
  it("posts one template message with ordered body parameters", async () => {
    const { meta, fetch } = transport(() =>
      json(200, { messages: [{ id: "wamid.ABC" }] }),
    );
    expect(await meta.deliver(delivery())).toEqual({
      ok: true,
      providerMessageId: "wamid.ABC",
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v23.0/1098765432/messages");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "12025550101",
      type: "template",
      template: {
        name: "booking_confirmed_v1",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Mona" },
              { type: "text", text: "RIV-123" },
            ],
          },
        ],
      },
    });
  });

  it("repeats the code on the copy code button of an authentication template", async () => {
    const { meta, fetch } = transport(() =>
      json(200, { messages: [{ id: "wamid.1" }] }),
    );
    await meta.deliver(
      delivery({ category: "AUTHENTICATION", parameters: ["482913"] }),
    );
    const body = JSON.parse(
      String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(body.template.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "482913" }] },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: "482913" }],
      },
    ]);
  });

  it("omits components for a template without variables", async () => {
    const { meta, fetch } = transport(() =>
      json(200, { messages: [{ id: "wamid.1" }] }),
    );
    await meta.deliver(delivery({ parameters: [] }));
    const body = JSON.parse(
      String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(body.template).not.toHaveProperty("components");
  });

  it("maps a timeout or network error to UNAVAILABLE", async () => {
    const { meta } = transport(() => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    expect(await meta.deliver(delivery())).toEqual({
      ok: false,
      code: "UNAVAILABLE",
      detail: "WhatsApp could not be reached. Try again later.",
    });
  });

  it.each([
    [429, {}, "RATE_LIMITED"],
    [400, { code: 130429, message: "Rate limit hit" }, "RATE_LIMITED"],
    [503, { code: 1, message: "Service unavailable" }, "UNAVAILABLE"],
    [
      404,
      { code: 132001, message: "Template name does not exist" },
      "PROVIDER_REJECTED",
    ],
  ])("maps HTTP %i with %j to %s", async (status, error, code) => {
    const { meta } = transport(() => json(status, { error }));
    expect(await meta.deliver(delivery())).toMatchObject({ ok: false, code });
  });

  it("reports a 200 without a message id as UNAVAILABLE", async () => {
    const { meta } = transport(() => json(200, { messages: [] }));
    expect(await meta.deliver(delivery())).toMatchObject({
      ok: false,
      code: "UNAVAILABLE",
    });
  });

  it("never returns the token, the phone, or a code in the error text", async () => {
    const { meta } = transport(() =>
      json(401, {
        error: {
          code: 190,
          message: `Invalid OAuth access token ${TOKEN} for ${PHONE}`,
          error_data: { details: "Code 482913 was not delivered" },
        },
      }),
    );
    const result = await meta.deliver(delivery());
    expect(result.ok).toBe(false);
    const detail = result.ok ? "" : result.detail;
    expect(detail).toContain("WhatsApp error 190 (HTTP 401)");
    expect(detail).not.toContain(TOKEN);
    expect(detail).not.toContain("12025550101");
    expect(detail).not.toContain("482913");
    expect(detail.length).toBeLessThanOrEqual(200);
  });
});

describe("sanitizeProviderText", () => {
  it("masks secrets and long digit runs, drops controls, and caps length", () => {
    const text = sanitizeProviderText(
      `bad\u0000 token SECRET for +20 100 123 4567 code 123456 id 42 ${"x".repeat(300)}`,
      ["SECRET"],
    );
    expect(text).toMatch(
      /^bad token \[secret\] for \[number\] code \[number\] id 42 x+…$/,
    );
    expect(text.length).toBe(200);
  });
});

describe("sanitizeProviderText phone formats", () => {
  it.each([
    "(202) 555-0199",
    "202.555.0199",
    "+1 (202) 555-0199",
    "202/555/0199",
  ])("masks %s", (phone) => {
    const text = sanitizeProviderText(`Cannot reach ${phone} now`);
    expect(text).toBe("Cannot reach [number] now");
  });

  it("keeps short numbers such as error codes", () => {
    expect(sanitizeProviderText("error 131026 (HTTP 400) id 42")).toContain(
      "HTTP 400",
    );
  });
});

describe("FakeWhatsAppTransport", () => {
  it("records deliveries in memory and refuses the reserved number", async () => {
    const fake = new FakeWhatsAppTransport();
    expect(await fake.deliver(delivery())).toEqual({
      ok: true,
      providerMessageId: "fake-1",
    });
    expect(
      await fake.deliver(
        delivery({ to: PhoneNumber.parse(FAKE_WHATSAPP_REJECTED_NUMBER) }),
      ),
    ).toMatchObject({ ok: false, code: "PROVIDER_REJECTED" });
    expect(fake.deliveries).toHaveLength(1);
  });
});
