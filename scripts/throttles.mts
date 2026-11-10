import { config } from "dotenv";

config({ quiet: true });

const [command, ...args] = process.argv.slice(2);
if (command !== "cleanup-public" || args.length > 0) {
  console.error("Usage: npm run throttles -- cleanup-public");
  process.exitCode = 2;
} else {
  try {
    const { cleanupPublicThrottles } = await import(
      "../src/composition/throttles.ts"
    );
    console.log(JSON.stringify(await cleanupPublicThrottles()));
  } catch {
    // Database errors can include connection details. Operator output stays safe.
    console.error("Public throttle cleanup failed.");
    process.exitCode = 1;
  }
}
