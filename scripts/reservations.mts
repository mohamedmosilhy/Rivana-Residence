import { config } from "dotenv";
config({ quiet: true });
const [command, ...extra] = process.argv.slice(2);
if ((command !== "outbox" && command !== "expire-tokens") || extra.length) {
  console.error("Usage: npm run reservations -- outbox | expire-tokens");
  process.exitCode = 2;
} else {
  try {
    const { runReservationJob } = await import(
      "../src/composition/reservation-jobs.ts"
    );
    console.log(JSON.stringify(await runReservationJob(command)));
  } catch {
    console.error("Reservation job failed.");
    process.exitCode = 1;
  }
}
