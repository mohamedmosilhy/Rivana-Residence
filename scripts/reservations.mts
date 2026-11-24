import { config } from "dotenv";
config({ quiet: true });

// Prisma's pg adapter (7.10, with pg 8.23) triggers pg's one time "client.query()
// while already executing a query" deprecation notice inside interactive
// transactions. It names no data and needs a dependency upgrade to remove, so
// this script drops that one notice and prints every other warning as Node does.
const DRIVER_NOTICE = "Calling client.query() when the client is already";
process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (warning.message.startsWith(DRIVER_NOTICE)) return;
  console.error(`(node:${process.pid}) ${warning.name}: ${warning.message}`);
});

const RESERVATION_JOBS = ["outbox", "expire-tokens"] as const;
const PAYMENT_JOBS = ["expire-holds", "reconcile-payments"] as const;
type ReservationJob = (typeof RESERVATION_JOBS)[number];
type PaymentJob = (typeof PAYMENT_JOBS)[number];
const isReservationJob = (name: string | undefined): name is ReservationJob =>
  RESERVATION_JOBS.some((job) => job === name);
const isPaymentJob = (name: string | undefined): name is PaymentJob =>
  PAYMENT_JOBS.some((job) => job === name);

const [command, ...extra] = process.argv.slice(2);

async function report(work: () => Promise<unknown>) {
  try {
    console.log(JSON.stringify(await work()));
  } catch {
    console.error("Reservation job failed.");
    process.exitCode = 1;
  }
}

if (!extra.length && isReservationJob(command)) {
  await report(async () =>
    (await import("../src/composition/reservation-jobs.ts")).runReservationJob(
      command,
    ),
  );
} else if (!extra.length && isPaymentJob(command)) {
  await report(async () =>
    (await import("../src/composition/payment-jobs.ts")).runPaymentJob(command),
  );
} else {
  console.error(
    `Usage: npm run reservations -- ${[...RESERVATION_JOBS, ...PAYMENT_JOBS].join(" | ")}`,
  );
  process.exitCode = 2;
}
