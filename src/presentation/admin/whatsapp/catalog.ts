import {
  WHATSAPP_CATEGORIES,
  WHATSAPP_LANGUAGES,
  WHATSAPP_PURPOSES,
  WHATSAPP_PURPOSE_VARIABLES,
} from "@/domain/notifications";

/**
 * The fixed choices the template form offers, built on the server from the
 * domain lists and passed to the client forms as plain data, so the form and
 * the server rules cannot drift and no domain code reaches the browser.
 */
export type WhatsAppCatalog = Readonly<{
  purposes: readonly string[];
  languages: readonly string[];
  categories: readonly string[];
  variablesByPurpose: Readonly<Record<string, readonly string[]>>;
}>;

export function buildWhatsAppCatalog(): WhatsAppCatalog {
  return {
    purposes: WHATSAPP_PURPOSES,
    languages: WHATSAPP_LANGUAGES,
    categories: WHATSAPP_CATEGORIES,
    variablesByPurpose: WHATSAPP_PURPOSE_VARIABLES,
  };
}
