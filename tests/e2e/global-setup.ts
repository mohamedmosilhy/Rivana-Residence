import { execFileSync } from "node:child_process";

export default function globalSetup() {
  if (!process.env.E2E_DATABASE_URL) return;
  execFileSync("npx", ["tsx", "tests/e2e/prepare-database.mts"], {
    env: process.env,
    stdio: "inherit",
  });
}
