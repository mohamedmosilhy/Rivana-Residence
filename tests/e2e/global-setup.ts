import { execFileSync } from "node:child_process";

export default function globalSetup() {
  if (!process.env.E2E_DATABASE_URL) return;
  // react-server resolves `server-only` to a no-op so the fixtures can use
  // the application's real repositories and media pipeline.
  execFileSync(
    "npx",
    ["tsx", "--conditions=react-server", "tests/e2e/prepare-database.mts"],
    {
      env: process.env,
      stdio: "inherit",
    },
  );
}
