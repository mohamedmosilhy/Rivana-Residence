import type { GuestAccess } from "@/presentation/api-client/guest";
import type { ApiProblem } from "@/presentation/api-client/result";

import { changeField, type ChangeError } from "./change-state";
import type { ServiceKind } from "./extras-state";
import type { AccessRefusal } from "./use-guest-reservation";

// What a refused preview or change means for the screen (API-G5, G6). The
// server decides; this only sorts its answer.

export type ClosedReason =
  | "STATUS"
  | "REQUEST_OPEN"
  | "DEADLINE_PASSED"
  | "PHONE_BLOCKED";

export type ChangeFailure =
  /** The guest's key no longer works. */
  | Readonly<{ kind: "access"; refusal: AccessRefusal }>
  | Readonly<{ kind: "closed"; reason: ClosedReason }>
  | Readonly<{ kind: "fields"; errors: readonly ChangeError[] }>
  | Readonly<{ kind: "service"; service: ServiceKind }>
  /** The booking moved on since the form was filled. */
  | Readonly<{ kind: "stale" }>
  | Readonly<{ kind: "price" }>
  | Readonly<{ kind: "taken" }>
  /** The booking or a listing was not found: only a fresh read can say. */
  | Readonly<{ kind: "gone" }>
  | Readonly<{ kind: "wait"; seconds: number }>
  | Readonly<{ kind: "busy" }>
  /** No usable answer. After a change, it may or may not have been made. */
  | Readonly<{ kind: "unknown" }>;

const REASONS: readonly ClosedReason[] = [
  "STATUS",
  "REQUEST_OPEN",
  "DEADLINE_PASSED",
  "PHONE_BLOCKED",
];

const FIELDS: readonly [RegExp, (match: RegExpExecArray) => string | null][] = [
  [/^stay\.checkIn/, () => changeField.checkIn],
  [/^stay\.checkOut/, () => changeField.checkOut],
  [/^lines\.(\d+)/, (match) => changeField.unit(Number(match[1]))],
  [/^services\.\d+\.vehicles/, () => changeField.cars],
  [/^services\.\d+\.details/, () => changeField.flight],
  [/^guest\.fullName/, () => changeField.fullName],
  [/^guest\.email/, () => changeField.email],
  [/^guest\.specialRequests/, () => changeField.specialRequests],
];

function fieldErrors(problem: ApiProblem): ChangeError[] {
  const errors = Object.entries(problem.fieldErrors ?? {}).map(
    ([path, messages]) => {
      let field: string | null = null;
      for (const [pattern, target] of FIELDS) {
        const match = pattern.exec(path);
        if (match) {
          field = target(match);
          break;
        }
      }
      return { field, message: messages.join(" ") };
    },
  );
  return errors.length > 0
    ? errors
    : [{ field: null, message: "Check your changes, then try again." }];
}

export function changeFailure(
  problem: ApiProblem,
  access: GuestAccess["kind"],
): ChangeFailure {
  switch (problem.code) {
    case "UNAUTHENTICATED":
    case "PHONE_NOT_VERIFIED":
      return {
        kind: "access",
        refusal: access === "SESSION" ? "session" : "gone",
      };
    case "PHONE_BLOCKED":
      return { kind: "closed", reason: "PHONE_BLOCKED" };
    case "CHANGE_NOT_ALLOWED": {
      const reason = REASONS.find((item) => item === problem.context?.reason);
      return { kind: "closed", reason: reason ?? "STATUS" };
    }
    case "VALIDATION":
      return { kind: "fields", errors: fieldErrors(problem) };
    case "SERVICE_UNAVAILABLE": {
      const kind = problem.context?.kind;
      return kind === "BREAKFAST" || kind === "AIRPORT_TRANSFER"
        ? { kind: "service", service: kind }
        : { kind: "unknown" };
    }
    case "STALE_VERSION":
    case "PRECONDITION_REQUIRED":
      return { kind: "stale" };
    case "PRICE_CHANGED":
      return { kind: "price" };
    case "INVENTORY_UNAVAILABLE":
      return { kind: "taken" };
    case "NOT_FOUND":
      return { kind: "gone" };
    case "RATE_LIMITED":
      return { kind: "wait", seconds: problem.retryAfter ?? 60 };
    case "TRY_AGAIN":
      return { kind: "busy" };
    default:
      return { kind: "unknown" };
  }
}
