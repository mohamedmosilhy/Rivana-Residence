import "server-only";

import type { StaffAccount, StaffDirectory } from "@/application/auth/ports";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

const accountSelection = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
} as const;

function mapAccount(row: StaffAccount): StaffAccount {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
  };
}

export class PrismaStaffDirectory implements StaffDirectory {
  constructor(private readonly client: DatabaseClient = getPrisma()) {}

  async listAccounts(now: Date) {
    const rows = await this.client.user.findMany({
      select: {
        ...accountSelection,
        _count: { select: { sessions: { where: { expiresAt: { gt: now } } } } },
      },
      orderBy: [{ active: "desc" }, { role: "asc" }, { email: "asc" }],
    });
    return rows.map(({ _count, ...row }) => ({
      ...mapAccount(row),
      activeSessions: _count.sessions,
    }));
  }

  async findById(id: string) {
    const row = await this.client.user.findUnique({
      where: { id },
      select: accountSelection,
    });
    return row ? mapAccount(row) : null;
  }

  async findByEmail(email: string) {
    const row = await this.client.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: accountSelection,
    });
    return row ? mapAccount(row) : null;
  }

  async isActive(id: string) {
    return (await this.findById(id))?.active === true;
  }

  async listSessions(
    userId: string,
    currentSessionId: string | null,
    now: Date,
  ) {
    const rows = await this.client.session.findMany({
      where: { userId, expiresAt: { gt: now } },
      select: { id: true, createdAt: true, expiresAt: true, userAgent: true },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      ...row,
      current: row.id === currentSessionId,
    }));
  }

  async revokeSessions(
    userId: string,
    options: Readonly<{ except?: string }> = {},
  ) {
    const { count } = await this.client.session.deleteMany({
      where: {
        userId,
        ...(options.except ? { id: { not: options.except } } : {}),
      },
    });
    return count;
  }
}
