export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

// A short local screen for the most common choices. It is not a breach
// database; it only stops obviously guessable staff passwords.
const COMMON_PASSWORDS = new Set([
  "123456789012",
  "1234567890123",
  "qwertyuiopas",
  "password1234",
  "password12345",
  "passwordpassword",
  "letmeinletmein",
  "iloveyou1234",
  "adminadmin123",
  "administrator",
  "welcome12345",
  "changeme1234",
  "rivanaresidence",
  "rivana123456",
]);

export function passwordPolicyIssues(
  password: string,
  context: Readonly<{ email?: string; name?: string }> = {},
) {
  const issues: string[] = [];
  const normalized = password.toLowerCase();

  if (password.length < PASSWORD_MIN_LENGTH) {
    issues.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    issues.push(`Use at most ${PASSWORD_MAX_LENGTH} characters.`);
  }
  if (/^(.)\1*$/.test(password)) {
    issues.push("Do not repeat a single character.");
  }
  if (COMMON_PASSWORDS.has(normalized.replace(/[\s!.?]+$/, ""))) {
    issues.push("Choose a less common password.");
  }

  const personal = [
    context.email?.split("@")[0],
    ...(context.name?.split(/\s+/) ?? []),
  ].filter((part): part is string => Boolean(part && part.length >= 4));
  if (personal.some((part) => normalized.includes(part.toLowerCase()))) {
    issues.push("Do not include your name or email address.");
  }

  return issues;
}
