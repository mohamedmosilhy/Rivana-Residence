import "server-only";

import { notPublishable, type Result } from "@/application/shared/result";
import { DomainValidationError } from "@/domain/shared/domain-error";

/**
 * Runs a domain publishability assertion. Returns a NOT_PUBLISHABLE result
 * for domain issues and null when the record may be (or stay) published.
 */
export function publishabilityFailure(
  assert: () => void,
): Result<never> | null {
  try {
    assert();
    return null;
  } catch (error) {
    if (error instanceof DomainValidationError) return notPublishable(error);
    throw error;
  }
}

/** Thrown inside a transaction to roll it back and return `result`. */
export class RollbackWith extends Error {
  constructor(readonly result: Result<never>) {
    super("Transaction rolled back.");
  }
}
