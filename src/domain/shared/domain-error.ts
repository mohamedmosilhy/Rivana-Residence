export type DomainIssue = Readonly<{
  path: string;
  message: string;
}>;

export class DomainValidationError extends Error {
  readonly issues: readonly DomainIssue[];

  constructor(message: string, issues: readonly DomainIssue[]) {
    super(message);
    this.name = "DomainValidationError";
    this.issues = issues;
  }
}

export function issuesFromZod(
  issues: readonly Readonly<{
    path: readonly PropertyKey[];
    message: string;
  }>[],
): DomainIssue[] {
  return issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}
