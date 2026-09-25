import "server-only";

import type { SettingsRepository } from "@/application/ports/repositories";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { mapSettings } from "@/infrastructure/db/prisma/mappers/content-mappers";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

const selection = {
  id: true,
  siteName: true,
  timeZone: true,
  phone: true,
  email: true,
  footerText: true,
} as const;

export class PrismaSettingsRepository implements SettingsRepository {
  constructor(private readonly client: DatabaseClient = getPrisma()) {}

  async getPublic() {
    const row = await this.client.siteSettings.findUnique({
      where: { id: "default" },
      select: selection,
    });
    return row ? mapSettings(row) : null;
  }

  getAdmin() {
    return this.getPublic();
  }
}
