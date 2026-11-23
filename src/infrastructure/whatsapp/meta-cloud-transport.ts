import "server-only";

import type {
  WhatsAppDelivery,
  WhatsAppTransport,
  WhatsAppTransportResult,
} from "@/application/notifications";

export const META_TIMEOUT_MS = 10_000;

/** Graph error codes Meta uses for throttling and spam limits. */
const RATE_LIMIT_CODES = new Set([4, 80007, 130429, 131048, 131056]);

export type MetaCloudTransportConfig = Readonly<{
  accessToken: string;
  /** e.g. `v23.0`; configuration, not a constant (spec 0005 Decision 6). */
  graphVersion: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}>;

type GraphError = Readonly<{
  code?: unknown;
}>;

/**
 * Meta WhatsApp Cloud API: one template message per call. The access token
 * lives only here. Failure details keep the HTTP status and numeric error
 * code. Provider text can echo message content and stays inside the adapter.
 */
export class MetaCloudWhatsAppTransport implements WhatsAppTransport {
  constructor(private readonly config: MetaCloudTransportConfig) {}

  async deliver(delivery: WhatsAppDelivery): Promise<WhatsAppTransportResult> {
    const url = `https://graph.facebook.com/${encodeURIComponent(
      this.config.graphVersion,
    )}/${encodeURIComponent(delivery.phoneNumberId)}/messages`;
    const doFetch = this.config.fetch ?? fetch;
    let response: Response;
    try {
      response = await doFetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messageBody(delivery)),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? META_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      return {
        ok: false,
        code: "UNAVAILABLE",
        detail: "WhatsApp could not be reached. Try again later.",
      };
    }

    const payload: unknown = await response.json().catch(() => null);
    if (response.ok) {
      const id = messageId(payload);
      return id
        ? { ok: true, providerMessageId: id }
        : {
            ok: false,
            code: "UNAVAILABLE",
            detail: "WhatsApp sent an unexpected response.",
          };
    }
    const providerCode = graphErrorCode(payload);
    const codeDetail = providerCode === undefined ? "" : ` ${providerCode}`;
    const detail = `WhatsApp error${codeDetail} (HTTP ${response.status})`;
    if (
      response.status === 429 ||
      (providerCode !== undefined && RATE_LIMIT_CODES.has(providerCode))
    ) {
      return { ok: false, code: "RATE_LIMITED", detail, providerCode };
    }
    if (response.status >= 500) {
      return { ok: false, code: "UNAVAILABLE", detail, providerCode };
    }
    return { ok: false, code: "PROVIDER_REJECTED", detail, providerCode };
  }
}

function messageBody(delivery: WhatsAppDelivery) {
  const components: unknown[] = [];
  if (delivery.parameters.length > 0) {
    components.push({
      type: "body",
      parameters: delivery.parameters.map((text) => ({ type: "text", text })),
    });
  }
  // Authentication templates carry the code again on the copy code button.
  if (delivery.category === "AUTHENTICATION" && delivery.parameters[0]) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: delivery.parameters[0] }],
    });
  }
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: delivery.to.value.replace(/^\+/, ""),
    type: "template",
    template: {
      name: delivery.templateName,
      language: { code: delivery.language },
      ...(components.length > 0 ? { components } : {}),
    },
  };
}

function messageId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const messages = (payload as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return null;
  const id = (messages[0] as { id?: unknown } | undefined)?.id;
  return typeof id === "string" && id.length > 0 ? id.slice(0, 200) : null;
}

function graphErrorCode(payload: unknown): number | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const error = (payload as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as GraphError).code;
  if (
    typeof code === "number" &&
    Number.isSafeInteger(code) &&
    code >= 0 &&
    code <= 999999
  )
    return code;
}
