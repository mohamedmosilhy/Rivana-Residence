// Plain language for the fixed WhatsApp lists. The keys stay as the server
// knows them; only the words the Admin reads are made friendly here.

/** `VERIFICATION_CODE` becomes "Verification code". */
export function purposeLabel(purpose: string) {
  const words = purpose.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** `guestFirstName` becomes "Guest first name". */
export function variableLabel(key: string) {
  const words = key.replace(/([A-Z])/g, " $1").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const LANGUAGES: Readonly<Record<string, string>> = {
  en: "English",
  ar: "Arabic",
};
export const languageLabel = (language: string) =>
  LANGUAGES[language] ?? language;

export const categoryLabel = (category: string) =>
  category.charAt(0) + category.slice(1).toLowerCase();
