export const E2E_PASSWORD = "Nile-evening-lantern-42";
export const E2E_PROJECTS = [
  "desktop-chromium",
  "mobile-chromium",
  "public-desktop",
  "public-mobile",
  "promotions",
] as const;

// Each Playwright project gets its own accounts so parallel runs never share
// sessions or throttle counters.
export function accountsFor(project: string) {
  return {
    admin: `admin-${project}@example.test`,
    editor: `editor-${project}@example.test`,
    inactive: `inactive-${project}@example.test`,
    lockout: `lockout-${project}@example.test`,
    account: `account-${project}@example.test`,
  };
}
