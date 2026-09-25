// Converts untrusted form values (strings from FormData) into the shapes the
// domain schemas validate. Nothing here decides validity: a bad number
// becomes NaN or undefined so the domain schema reports it next to the field.

export type FormValues = Readonly<Record<string, unknown>>;

const MAX_JSON_LENGTH = 64_000;

export function stringValue(values: FormValues, name: string) {
  const value = values[name];
  return typeof value === "string" ? value : "";
}

/** A blank value means "not set". */
export function optionalString(values: FormValues, name: string) {
  const value = stringValue(values, name).trim();
  return value === "" ? null : value;
}

/** Blank → null; anything else → a number (NaN when malformed). */
export function optionalNumber(values: FormValues, name: string) {
  const value = stringValue(values, name).trim();
  return value === "" ? null : Number(value);
}

/** Blank → undefined so the schema reports the field as missing. */
export function requiredNumber(values: FormValues, name: string) {
  const value = stringValue(values, name).trim();
  return value === "" ? undefined : Number(value);
}

export function checkbox(values: FormValues, name: string) {
  const value = values[name];
  return value === "on" || value === "true";
}

/** Parses a JSON-encoded list field; anything else becomes null. */
export function jsonValue(values: FormValues, name: string): unknown {
  const value = values[name];
  if (typeof value !== "string" || value.length > MAX_JSON_LENGTH) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function formDataValues(formData: FormData): FormValues {
  const values: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (!(key in values)) values[key] = value;
  }
  return values;
}
