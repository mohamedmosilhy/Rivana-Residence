import type { DomainIssue } from "@/domain/shared/domain-error";

export const SERVICE_KINDS = ["BREAKFAST", "AIRPORT_TRANSFER"] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

export function isServiceKind(value: unknown): value is ServiceKind {
  return (
    typeof value === "string" &&
    (SERVICE_KINDS as readonly string[]).includes(value)
  );
}

/** The `{kind}` path parameter of the staff service API (S36). */
export function parseServiceKind(
  input: unknown,
):
  | Readonly<{ ok: true; value: ServiceKind }>
  | Readonly<{ ok: false; issues: readonly DomainIssue[] }> {
  if (isServiceKind(input)) return { ok: true, value: input };
  return {
    ok: false,
    issues: [{ path: "kind", message: "Use a supported service." }],
  };
}
