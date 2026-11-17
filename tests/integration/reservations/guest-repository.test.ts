import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PhoneNumber } from "@/domain/guests";
import { success } from "@/application/shared/result";
import { PrismaGuestRepository } from "@/infrastructure/db/prisma/repositories/reservations/guests/guest-repository";
import { PrismaReservationUnitOfWork } from "@/infrastructure/db/prisma/unit-of-work";
import {
  createActor,
  createTestClient,
  resetDatabase,
} from "../support/database";
import { at } from "./support/reservation-repositories";
import {
  deferred,
  waitForDatabaseLock,
  withIndependentClients,
} from "./support/concurrency";

const client = createTestClient();
const phone = PhoneNumber.parse("+201001234567");
const identity = {
  id: "repo-guest",
  phone,
  name: "Fictional Guest",
  email: "fiction@example.test",
  at,
};
const repo = new PrismaGuestRepository(client);
beforeEach(() => resetDatabase(client));
afterAll(() => client.$disconnect());
const uow = () =>
  new PrismaReservationUnitOfWork(client, (tx) => ({
    guests: new PrismaGuestRepository(tx),
  }));

describe("guest profile storage", () => {
  it("creates a normalized global identity without inventing verification or consent", async () => {
    expect(await repo.findByPhone(phone)).toBeNull();
    expect(await repo.ensureExists(identity)).toMatchObject({
      id: identity.id,
      phone: phone.value,
      phoneVerifiedAt: null,
      marketingOptInAt: null,
      marketingConsentVersion: null,
      marketingOptOutAt: null,
      blockedAt: null,
    });
    expect(
      await repo.ensureExists({
        ...identity,
        id: "other-id",
        name: "Do not overwrite",
      }),
    ).toMatchObject({ id: identity.id, name: identity.name });
    expect(await client.guest.count()).toBe(1);
  });

  it("contact updates preserve verification, block and consent records exactly", async () => {
    await createActor(client);
    await repo.ensureExists(identity);
    const protectedFields = {
      phoneVerifiedAt: at,
      blockedAt: at,
      blockedById: "actor-admin",
      blockReason: "Recorded reason",
      marketingOptInAt: at,
      marketingConsentVersion: "test-version",
      marketingOptOutAt: at,
    };
    await client.guest.update({
      where: { id: identity.id },
      data: protectedFields,
    });
    const result = await uow().run(async ({ guests }) => {
      const locked = await guests.lockByPhone(phone);
      if (!locked.ok) return locked;
      expect(locked.value).toMatchObject(protectedFields);
      return success(
        await guests.updateContact({
          id: identity.id,
          name: "Updated Name",
          email: null,
          at: new Date(at.getTime() + 1000),
        }),
      );
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        ...protectedFields,
        phone: phone.value,
        name: "Updated Name",
        email: null,
      },
    });
  });

  it("returns null for a missing locked phone", async () => {
    expect(await uow().run(({ guests }) => guests.lockByPhone(phone))).toEqual(
      success(null),
    );
  });

  it("serializes identity creation by normalized phone, 20 observed waits", async () => {
    await withIndependentClients(2, async ([first, second]) => {
      if (!first || !second) throw new Error("Missing independent clients");
      for (let index = 0; index < 20; index++) {
        const release = deferred();
        const ready = deferred();
        const pid = deferred<number>();
        const winner = first.$transaction(async (tx) => {
          await new PrismaGuestRepository(tx).ensureExists({
            ...identity,
            id: `winner-${index}`,
          });
          ready.resolve();
          await release.promise;
        });
        await ready.promise;
        const loser = second.$transaction(async (tx) => {
          const [backend] = await tx.$queryRaw<
            { pid: number }[]
          >`SELECT pg_backend_pid()::int AS pid`;
          pid.resolve(backend!.pid);
          return new PrismaGuestRepository(tx).ensureExists({
            ...identity,
            id: `loser-${index}`,
            name: "Other name",
          });
        });
        try {
          await waitForDatabaseLock(client, await pid.promise);
        } finally {
          release.resolve();
        }
        await winner;
        expect(await loser).toMatchObject({
          id: `winner-${index}`,
          name: identity.name,
        });
        expect(await client.guest.count()).toBe(1);
        await client.guest.deleteMany();
      }
    });
  });

  it("reads the latest blocked state after waiting on the guest lock, 20 observed waits", async () => {
    await createActor(client);
    await repo.ensureExists(identity);
    await withIndependentClients(2, async ([first, second]) => {
      if (!first || !second) throw new Error("Missing independent clients");
      for (let index = 0; index < 20; index++) {
        const release = deferred();
        const ready = deferred();
        const pid = deferred<number>();
        const blockedAt = new Date(at.getTime() + index * 1000);
        const winner = first.$transaction(async (tx) => {
          await tx.guest.update({
            where: { id: identity.id },
            data: {
              blockedAt,
              blockedById: "actor-admin",
              blockReason: "Concurrent block",
            },
          });
          ready.resolve();
          await release.promise;
        });
        await ready.promise;
        const loser = second.$transaction(async (tx) => {
          const [backend] = await tx.$queryRaw<
            { pid: number }[]
          >`SELECT pg_backend_pid()::int AS pid`;
          pid.resolve(backend!.pid);
          return new PrismaGuestRepository(tx).lockByPhone(phone);
        });
        try {
          await waitForDatabaseLock(client, await pid.promise);
        } finally {
          release.resolve();
        }
        await winner;
        expect(await loser).toMatchObject({
          ok: true,
          value: {
            blockedAt,
            blockedById: "actor-admin",
            blockReason: "Concurrent block",
          },
        });
      }
    });
  });

  it("maps a guest row lock timeout to TRY_AGAIN without changing the profile", async () => {
    await repo.ensureExists(identity);
    await withIndependentClients(2, async ([first, second]) => {
      if (!first || !second) throw new Error("Missing independent clients");
      const release = deferred();
      const ready = deferred();
      const winner = first.$transaction(
        async (tx) => {
          await new PrismaGuestRepository(tx).lockByPhone(phone);
          ready.resolve();
          await release.promise;
        },
        { timeout: 10000 },
      );
      await ready.promise;
      try {
        const result = await new PrismaReservationUnitOfWork(second, (tx) => ({
          guests: new PrismaGuestRepository(tx),
        })).run(({ guests }) => guests.lockByPhone(phone));
        expect(result).toMatchObject({
          ok: false,
          error: { code: "TRY_AGAIN" },
        });
      } finally {
        release.resolve();
        await winner;
      }
      expect(await repo.findByPhone(phone)).toMatchObject({
        id: identity.id,
        name: identity.name,
      });
    });
  });
});
