import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.ts";
import { seedDatabase } from "./seed-data.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const client = new PrismaClient({
  // Timestamps must round-trip in UTC; see src/infrastructure/db/prisma/client.ts.
  adapter: new PrismaPg({
    connectionString: databaseUrl,
    options: "-c TimeZone=UTC",
  }),
});

try {
  await seedDatabase(client);
} finally {
  await client.$disconnect();
}
