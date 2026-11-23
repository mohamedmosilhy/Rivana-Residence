// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  WhatsAppDelivery,
  WhatsAppTransport,
} from "@/application/notifications";
import { PhoneNumber } from "@/domain/guests";
import {
  FAKE_WHATSAPP_REJECTED_NUMBER,
  FakeWhatsAppTransport,
} from "@/infrastructure/whatsapp/fake-transport";
import { MetaCloudWhatsAppTransport } from "@/infrastructure/whatsapp/meta-cloud-transport";

const accessToken = "dummy-whatsapp-token";
const content = "Sample guest and booking details";
const acceptedNumber = "+12025550101";
const rejectedNumber = FAKE_WHATSAPP_REJECTED_NUMBER;

function templateDelivery(to: string): WhatsAppDelivery {
  return {
    phoneNumberId: "1098765432",
    templateName: "booking_confirmed_v1",
    language: "en",
    category: "UTILITY",
    to: PhoneNumber.parse(to),
    parameters: [content],
  };
}

type Fixture = {
  name: string;
  create: (reject: boolean) => WhatsAppTransport;
};

const adapters: Fixture[] = [
  { name: "fake", create: () => new FakeWhatsAppTransport() },
  {
    name: "Meta",
    create: (reject) =>
      new MetaCloudWhatsAppTransport({
        accessToken,
        graphVersion: "v23.0",
        fetch: async () =>
          reject
            ? Response.json(
                {
                  error: {
                    code: 132001,
                    message: `Token ${accessToken} for ${rejectedNumber}`,
                    error_data: { details: content },
                  },
                },
                { status: 404 },
              )
            : Response.json({ messages: [{ id: "wamid.contract" }] }),
      }),
  },
];

afterEach(() => vi.restoreAllMocks());

// AC-9, AC-10, T-ADP. The same port expectations apply to every adapter.
describe.each(adapters)("WhatsAppTransport contract ($name)", ({ create }) => {
  it("returns a message id without logging the delivery", async () => {
    const logs = (["log", "info", "warn", "error", "debug"] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => {}),
    );
    expect(
      await create(false).deliver(templateDelivery(acceptedNumber)),
    ).toEqual({
      ok: true,
      providerMessageId: expect.stringMatching(/\S/),
    });
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });

  it("maps a permanent refusal without leaking provider text or delivery data", async () => {
    const logs = (["log", "info", "warn", "error", "debug"] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const result = await create(true).deliver(templateDelivery(rejectedNumber));
    expect(result).toMatchObject({ ok: false, code: "PROVIDER_REJECTED" });
    for (const value of [accessToken, rejectedNumber, content]) {
      expect(JSON.stringify(result)).not.toContain(value);
    }
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});

it("records only successful fake WhatsApp deliveries", async () => {
  const fake = new FakeWhatsAppTransport();
  const delivery = templateDelivery(acceptedNumber);
  await fake.deliver(delivery);
  await fake.deliver(templateDelivery(rejectedNumber));
  expect(fake.deliveries).toEqual([delivery]);
});
