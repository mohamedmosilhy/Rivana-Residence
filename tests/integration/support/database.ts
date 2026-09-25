import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

import { testDatabaseUrl } from "./test-database";

export function createTestClient() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: testDatabaseUrl().url,
      options: "-c TimeZone=UTC",
    }),
  });
}

export async function resetDatabase(client: PrismaClient) {
  const tables = await client.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map(({ tablename }) => `"${tablename}"`).join(", ");
  await client.$executeRawUnsafe(`TRUNCATE ${list} CASCADE`);
}

export const actor = { id: "actor-admin", role: "ADMIN" } as const;

export async function createActor(client: PrismaClient) {
  await client.user.create({
    data: {
      id: actor.id,
      name: "Test Administrator",
      email: "admin@example.test",
      role: "ADMIN",
    },
  });
}

let sequence = 0;
function next(prefix: string) {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

export async function createMedia(
  client: PrismaClient,
  overrides: Partial<{
    status: "PENDING" | "READY" | "FAILED" | "DELETED";
    altText: string;
  }> = {},
) {
  const id = next("media");
  const status = overrides.status ?? "READY";
  return client.mediaAsset.create({
    data: {
      id,
      storageProvider: "local",
      storageContainer: "public",
      storageKey: `rooms/${id}.webp`,
      originalFilename: `${id}.webp`,
      mimeType: "image/webp",
      bytes: 1024,
      width: status === "READY" ? 1600 : null,
      height: status === "READY" ? 900 : null,
      altText: overrides.altText ?? "Bedroom with river view",
      status,
    },
  });
}

const description = { type: "doc", content: [] };

export async function createRoom(
  client: PrismaClient,
  overrides: Partial<{
    slug: string;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    sortOrder: number;
    heroMediaId: string;
  }> = {},
) {
  const id = next("room");
  return client.room.create({
    data: {
      id,
      name: `Room ${id}`,
      slug: overrides.slug ?? id,
      shortDescription: "A calm room above the river.",
      description,
      maxAdults: 2,
      sortOrder: overrides.sortOrder ?? sequence,
      status: overrides.status ?? "DRAFT",
      ...(overrides.heroMediaId
        ? {
            media: {
              create: {
                mediaId: overrides.heroMediaId,
                role: "HERO",
                sortOrder: 0,
              },
            },
          }
        : {}),
    },
  });
}

export async function createFacility(
  client: PrismaClient,
  overrides: Partial<{
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    sortOrder: number;
    heroMediaId: string;
  }> = {},
) {
  const id = next("facility");
  return client.facility.create({
    data: {
      id,
      name: `Facility ${id}`,
      slug: id,
      shortDescription: "An outdoor pool terrace.",
      description,
      sortOrder: overrides.sortOrder ?? sequence,
      status: overrides.status ?? "DRAFT",
      ...(overrides.heroMediaId
        ? {
            media: {
              create: {
                mediaId: overrides.heroMediaId,
                role: "HERO",
                sortOrder: 0,
              },
            },
          }
        : {}),
    },
  });
}
