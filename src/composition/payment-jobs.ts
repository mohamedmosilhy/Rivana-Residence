import "server-only";
import type {
  ExpirePaymentHoldsSummary,
  ReconcilePaymentsSummary,
} from "@/application/reservations";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { runWithJobLock } from "@/infrastructure/db/prisma/job-lock";
import { expirePaymentHolds, reconcilePayments } from "./reservations";

export type PaymentJobCommand = "expire-holds" | "reconcile-payments";

/** One advisory lock key per job, so a slow run is never overlapped by the next cron start. */
export const PAYMENT_JOB_LOCK_KEYS: Record<PaymentJobCommand, number> = {
  "expire-holds": 724_001,
  "reconcile-payments": 724_002,
};

/**
 * Runs one scheduled payment job unless the same job is already running
 * (spec 0006 Decision 6). A skipped run reports it.
 */
export async function runPaymentJobOn(
  client: ReturnType<typeof getPrisma>,
  command: PaymentJobCommand,
) {
  const result = await runWithJobLock<
    ExpirePaymentHoldsSummary | ReconcilePaymentsSummary
  >(client, PAYMENT_JOB_LOCK_KEYS[command], () =>
    command === "expire-holds"
      ? expirePaymentHolds({ client }).run()
      : reconcilePayments({ client }).run(),
  );
  return result ?? ({ skipped: "ALREADY_RUNNING" } as const);
}

/** The scheduled payment jobs of `npm run reservations` (spec 0006 Decision 6). */
export async function runPaymentJob(command: PaymentJobCommand) {
  const client = getPrisma();
  try {
    return await runPaymentJobOn(client, command);
  } finally {
    await client.$disconnect();
  }
}
