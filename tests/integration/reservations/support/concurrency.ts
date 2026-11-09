import type { PrismaClient } from "@/generated/prisma/client";

import { createTestClient } from "../../support/database";

export type Deferred<Value> = Readonly<{
  promise: Promise<Value>;
  resolve(value: Value): void;
  reject(error: unknown): void;
}>;

export function deferred<Value = void>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

export function barrier(parties: number) {
  const ready = deferred();
  let arrived = 0;
  return async () => {
    arrived += 1;
    if (arrived === parties) ready.resolve();
    await ready.promise;
  };
}

export async function withIndependentClients<Value>(
  count: number,
  run: (clients: readonly PrismaClient[]) => Promise<Value>,
): Promise<Value> {
  const clients = Array.from({ length: count }, () => createTestClient());
  try {
    return await run(clients);
  } finally {
    await Promise.all(clients.map((client) => client.$disconnect()));
  }
}

export async function waitForDatabaseLock(
  observer: PrismaClient,
  backendPid: number,
) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [activity] = await observer.$queryRaw<
      Readonly<{ waitType: string | null }>[]
    >`SELECT wait_event_type AS "waitType" FROM pg_stat_activity WHERE pid = ${backendPid}`;
    if (activity?.waitType === "Lock") return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`Backend ${backendPid} did not enter a database lock wait.`);
}
