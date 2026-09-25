import type {
  DomainIssue,
  DomainValidationError,
} from "@/domain/shared/domain-error";

export type ApplicationErrorCode =
  | "CONFLICT"
  | "NOT_FOUND"
  | "NOT_PUBLISHABLE"
  | "REFERENCED"
  | "VALIDATION";

export type ApplicationError = Readonly<{
  code: ApplicationErrorCode;
  message: string;
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
}>;

export type Result<T, E = ApplicationError> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: E }>;

export function success<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function failure(
  code: ApplicationErrorCode,
  message: string,
  fieldErrors?: Readonly<Record<string, readonly string[]>>,
): Result<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(fieldErrors ? { fieldErrors } : {}),
    },
  };
}

function groupIssues(issues: readonly DomainIssue[]) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    (fieldErrors[issue.path] ??= []).push(issue.message);
  }
  return fieldErrors;
}

export function notPublishable(error: DomainValidationError): Result<never> {
  return failure("NOT_PUBLISHABLE", error.message, groupIssues(error.issues));
}

export function invalid(
  message: string,
  issues: readonly DomainIssue[],
): Result<never> {
  return failure("VALIDATION", message, groupIssues(issues));
}
