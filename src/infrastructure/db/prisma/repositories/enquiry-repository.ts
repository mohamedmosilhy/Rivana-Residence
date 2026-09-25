import "server-only";

import { createId } from "@paralleldrive/cuid2";

import type {
  Actor,
  ContactEnquiryDto,
  EnquiryRepository,
} from "@/application/ports/repositories";
import { invalid, success } from "@/application/shared/result";
import { contactEnquirySchema } from "@/domain/enquiries/contact-enquiry";
import { issuesFromZod } from "@/domain/shared/domain-error";
import type { EnquiryStatus } from "@/domain/shared/types";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { translatePrismaWriteError } from "@/infrastructure/db/prisma/error-translation";
import { mapEnquiry } from "@/infrastructure/db/prisma/mappers/content-mappers";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

export class PrismaEnquiryRepository implements EnquiryRepository {
  constructor(private readonly client: DatabaseClient = getPrisma()) {}

  async listAdmin(status?: EnquiryStatus) {
    const rows = await this.client.contactEnquiry.findMany({
      where: status ? { status } : {},
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });
    return rows.map(mapEnquiry);
  }

  async create(input: Omit<ContactEnquiryDto, "id" | "status" | "createdAt">) {
    const validated = contactEnquirySchema.safeParse(input);
    if (!validated.success) {
      return invalid(
        "Contact enquiry is invalid.",
        issuesFromZod(validated.error.issues),
      );
    }
    try {
      const row = await this.client.contactEnquiry.create({
        data: { id: createId(), ...validated.data },
      });
      return success(mapEnquiry(row));
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }

  async archive(id: string, _actor: Actor, now: Date) {
    try {
      await this.client.contactEnquiry.update({
        where: { id },
        data: { status: "ARCHIVED", archivedAt: now },
      });
      return success(undefined);
    } catch (error) {
      return translatePrismaWriteError(error);
    }
  }
}
