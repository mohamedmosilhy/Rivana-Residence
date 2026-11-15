import { DomainValidationError } from "@/domain/shared/domain-error";

export function policyInputError(path: string): never {
  throw new DomainValidationError("The policy input is invalid.", [
    { path, message: "Supply valid policy facts." },
  ]);
}
export function instant(value: Date, path = "now"): number {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    policyInputError(path);
  return value.getTime();
}
export function count(value: number, path: string): number {
  if (!Number.isSafeInteger(value) || value < 0) policyInputError(path);
  return value;
}
