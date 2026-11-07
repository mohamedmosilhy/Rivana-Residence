import { failure, success, type Result } from "@/application/shared/result";

export interface DatabaseProbe {
  /** Resolves when the database answers a trivial query; rejects otherwise. */
  ping(): Promise<void>;
}

export type HealthStatus = Readonly<{ status: "ok"; database: "ok" }>;

export const HEALTH_PROBE_TIMEOUT_MS = 2000;

/**
 * Liveness of the app and its database for monitors (API-health). Reports no
 * version, environment, or error detail.
 */
export class CheckHealth {
  constructor(
    private readonly database: DatabaseProbe,
    private readonly timeoutMs = HEALTH_PROBE_TIMEOUT_MS,
  ) {}

  async execute(): Promise<Result<HealthStatus>> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), this.timeoutMs);
    });
    try {
      await Promise.race([this.database.ping(), timeout]);
      return success({ status: "ok", database: "ok" });
    } catch {
      return failure("TRY_AGAIN", "The service is temporarily unavailable.");
    } finally {
      clearTimeout(timer);
    }
  }
}
