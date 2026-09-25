export const ADMIN_PAGE_SIZE = 20;

export function pageCount(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Reads a 1-based page number from untrusted input, defaulting to 1. */
export function parsePageNumber(value: unknown) {
  const page = typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}
