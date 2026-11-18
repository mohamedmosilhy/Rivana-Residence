import "server-only";

import type {
  WhatsAppTemplateRecord,
  WhatsAppTemplateRepository,
} from "@/application/notifications";
import { failure, success, type Result } from "@/application/shared/result";
import {
  WHATSAPP_CATEGORIES,
  WHATSAPP_LANGUAGES,
  WHATSAPP_PURPOSES,
  WHATSAPP_VARIABLE_KEYS,
  type WhatsAppPurpose,
  type WhatsAppTemplateInput,
} from "@/domain/notifications";
import type { Prisma } from "@/generated/prisma/client";
import {
  postgresErrorCode,
  translatePrismaWriteError,
} from "@/infrastructure/db/prisma/error-translation";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

const BUSY = "WhatsApp templates are busy. Please try again shortly.";
const TAKEN = "A template is already active for this purpose and language.";

const select = {
  id: true,
  purpose: true,
  language: true,
  providerName: true,
  category: true,
  variables: true,
  previewText: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;
type Row = Prisma.WhatsAppTemplateGetPayload<{ select: typeof select }>;

function oneOf<T extends string>(
  values: readonly T[],
  value: string,
  field: string,
): T {
  if ((values as readonly string[]).includes(value)) return value as T;
  throw new Error(`A stored WhatsApp template has an unknown ${field}.`);
}

function record(row: Row): WhatsAppTemplateRecord {
  const variables = Array.isArray(row.variables) ? row.variables : [];
  return {
    id: row.id,
    purpose: oneOf(WHATSAPP_PURPOSES, row.purpose, "purpose"),
    language: oneOf(WHATSAPP_LANGUAGES, row.language, "language"),
    providerName: row.providerName,
    category: oneOf(WHATSAPP_CATEGORIES, row.category, "category"),
    variables: variables.map((key) =>
      oneOf(WHATSAPP_VARIABLE_KEYS, String(key), "variable"),
    ),
    previewText: row.previewText,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * A row the code no longer understands (an allowlist entry removed, a hand
 * edit) is skipped, so one bad template cannot stall every read or send.
 */
function readable(row: Row): WhatsAppTemplateRecord | null {
  try {
    return record(row);
  } catch {
    return null;
  }
}

function data(input: WhatsAppTemplateInput) {
  return {
    purpose: input.purpose,
    language: input.language,
    providerName: input.providerName,
    category: input.category,
    variables: [...input.variables],
    previewText: input.previewText,
    active: input.active,
  };
}

/** The partial unique index allows one active template per purpose and language. */
function translateWrite(error: unknown): Result<never> {
  const code = postgresErrorCode(error);
  if (code === "55P03") return failure("TRY_AGAIN", BUSY);
  if (code === "23505") return failure("CONFLICT", TAKEN);
  return translatePrismaWriteError(error);
}

export class PrismaWhatsAppTemplateRepository
  implements WhatsAppTemplateRepository
{
  constructor(private readonly client: DatabaseClient) {}

  async list() {
    const rows = await this.client.whatsAppTemplate.findMany({
      select,
      orderBy: [
        { purpose: "asc" },
        { language: "asc" },
        { active: "desc" },
        { updatedAt: "desc" },
        { id: "asc" },
      ],
    });
    return rows.flatMap((row) => readable(row) ?? []);
  }

  async findById(id: string) {
    const row = await this.client.whatsAppTemplate.findUnique({
      where: { id },
      select,
    });
    return row ? readable(row) : null;
  }

  async findActive(purpose: WhatsAppPurpose, language: string) {
    // MARKETING may have several active templates (M13); pick a stable
    // readable one.
    const rows = await this.client.whatsAppTemplate.findMany({
      where: { purpose, language, active: true },
      select,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
    for (const row of rows) {
      const found = readable(row);
      if (found) return found;
    }
    return null;
  }

  async create(
    id: string,
    input: WhatsAppTemplateInput,
    actorId: string,
    now: Date,
  ): Promise<Result<WhatsAppTemplateRecord>> {
    try {
      await this.client.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      const row = await this.client.whatsAppTemplate.create({
        data: {
          id,
          ...data(input),
          createdAt: now,
          updatedAt: now,
          updatedById: actorId,
        },
        select,
      });
      return success(record(row));
    } catch (error) {
      return translateWrite(error);
    }
  }

  async lock(id: string): Promise<Result<WhatsAppTemplateRecord | null>> {
    try {
      await this.client.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      const locked = await this.client.$queryRaw<Readonly<{ id: string }>[]>`
        SELECT id FROM "WhatsAppTemplate" WHERE id = ${id} FOR UPDATE
      `;
      if (!locked.length) return success(null);
      return success(await this.findById(id));
    } catch (error) {
      if (postgresErrorCode(error) === "55P03")
        return failure("TRY_AGAIN", BUSY);
      throw error;
    }
  }

  async replace(
    id: string,
    input: WhatsAppTemplateInput,
    actorId: string,
    now: Date,
  ): Promise<Result<WhatsAppTemplateRecord>> {
    try {
      const row = await this.client.whatsAppTemplate.update({
        where: { id },
        data: { ...data(input), updatedAt: now, updatedById: actorId },
        select,
      });
      return success(record(row));
    } catch (error) {
      return translateWrite(error);
    }
  }
}
