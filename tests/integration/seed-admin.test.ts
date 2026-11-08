import { verifyPassword } from "better-auth/crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ensureSeedAdmin } from "../../prisma/seed/admin";
import { SEED_ADMIN } from "../../prisma/seed/admin-credentials";
import { createTestClient, resetDatabase } from "./support/database";

const client = createTestClient();
const FIRST = "river-lantern-4471-quiet";
const SECOND = "harbor-violet-2290-bright";

beforeEach(() => resetDatabase(client));
afterAll(() => client.$disconnect());

function credentialHash() {
  return client.account.findFirst({
    where: { user: { email: SEED_ADMIN.email }, providerId: "credential" },
    select: { password: true },
  });
}

async function accepts(password: string) {
  const account = await credentialHash();
  return verifyPassword({ hash: account!.password!, password });
}

describe("ensureSeedAdmin (F07)", () => {
  it("creates an active administrator with the supplied password only", async () => {
    const { user, created } = await ensureSeedAdmin(client, FIRST);
    expect(created).toBe(true);
    expect(user).toMatchObject({ role: "ADMIN", active: true });
    const account = await credentialHash();
    expect(account?.password).toBeTruthy();
    expect(account?.password).not.toBe(FIRST);
    expect(await accepts(FIRST)).toBe(true);
    expect(await accepts(SECOND)).toBe(false);
  });

  it("does not reset an existing administrator on a repeat run", async () => {
    await ensureSeedAdmin(client, FIRST);
    const before = await credentialHash();

    const again = await ensureSeedAdmin(client, SECOND);

    expect(again.created).toBe(false);
    expect((await credentialHash())?.password).toBe(before?.password);
    expect(await accepts(FIRST)).toBe(true);
    expect(await accepts(SECOND)).toBe(false);
    expect(
      await client.user.count({ where: { email: SEED_ADMIN.email } }),
    ).toBe(1);
  });

  it("leaves an existing account's status and password untouched", async () => {
    await ensureSeedAdmin(client, FIRST);
    await client.user.update({
      where: { email: SEED_ADMIN.email },
      data: { active: false },
    });
    const before = await credentialHash();

    await ensureSeedAdmin(client, SECOND);

    const user = await client.user.findUnique({
      where: { email: SEED_ADMIN.email },
    });
    expect(user?.active).toBe(false);
    expect((await credentialHash())?.password).toBe(before?.password);
  });
});
