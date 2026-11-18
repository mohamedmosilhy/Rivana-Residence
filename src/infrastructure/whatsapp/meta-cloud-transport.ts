import "server-only";

import type {
  WhatsAppDelivery,
  WhatsAppTransport,
  WhatsAppTransportResult,
} from "@/application/notifications";

import { capDetail, sanitizeProviderText } from "./sanitize";

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
  message?: unknown;
  error_data?: Readonly<{ details?: unknown }>;
}>;

/**
 * Meta WhatsApp Cloud API: one template message per call. The access token
 * lives only here. Errors are mapped to the port's failure codes, and their
 * text is sanitized: no token, phone, code, or parameter ever leaves.
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
    const error = graphError(payload);
    const detail = this.describe(response.status, error);
    if (
      response.status === 429 ||
      (typeof error?.code === "number" && RATE_LIMIT_CODES.has(error.code))
    ) {
      return { ok: false, code: "RATE_LIMITED", detail };
    }
    if (response.status >= 500) {
      return { ok: false, code: "UNAVAILABLE", detail };
    }
    return { ok: false, code: "PROVIDER_REJECTED", detail };
  }

  private describe(status: number, error: GraphError | null): string {
    const code = typeof error?.code === "number" ? ` ${error.code}` : "";
    const message = typeof error?.message === "string" ? error.message : "";
    const details =
      typeof error?.error_data?.details === "string"
        ? error.error_data.details
        : "";
    // Only Meta's free text is sanitized; the numeric code and status are ours.
    const text = sanitizeProviderText(
      [message, details].filter(Boolean).join(" "),
      [this.config.accessToken],
    );
    return capDetail(
      `WhatsApp error${code} (HTTP ${status})${text ? `: ${text}` : ""}`,
    );
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

function graphError(payload: unknown): GraphError | null {
  if (typeof payload !== "object" || payload === null) return null;
  const error = (payload as { error?: unknown }).error;
  return typeof error === "object" && error !== null
    ? (error as GraphError)
    : null;
}
