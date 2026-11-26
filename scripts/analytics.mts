import { config } from "dotenv";

config({ quiet: true });

const [command, ...args] = process.argv.slice(2);
if (command !== "rollup" || args.length > 0) {
  console.error("Usage: npm run analytics -- rollup");
  process.exitCode = 2;
} else {
  try {
    const { runSiteEventRollup } = await import(
      "../src/composition/analytics-jobs.ts"
    );
    const summary = await runSiteEventRollup();
    console.log(JSON.stringify(summary));
    if ("failedDays" in summary && summary.failedDays > 0) process.exitCode = 1;
  } catch {
    // Database errors can include connection details. Operator output stays safe.
    console.error("Analytics rollup failed.");
    process.exitCode = 1;
  }
}
