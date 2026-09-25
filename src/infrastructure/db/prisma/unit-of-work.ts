import "server-only";

import type {
  TransactionRepositories,
  UnitOfWork,
} from "@/application/ports/repositories";
import { getPrisma } from "@/infrastructure/db/prisma/client";
import { PrismaFacilityRepository } from "@/infrastructure/db/prisma/repositories/facility-repository";
import { PrismaMediaRepository } from "@/infrastructure/db/prisma/repositories/media-repository";
import { PrismaPageRepository } from "@/infrastructure/db/prisma/repositories/page-repository";
import { PrismaPromotionRepository } from "@/infrastructure/db/prisma/repositories/promotion-repository";
import { PrismaRoomRepository } from "@/infrastructure/db/prisma/repositories/room-repository";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

function repositories(client: DatabaseClient): TransactionRepositories {
  return {
    rooms: new PrismaRoomRepository(client),
    facilities: new PrismaFacilityRepository(client),
    pages: new PrismaPageRepository(client),
    media: new PrismaMediaRepository(client),
    promotions: new PrismaPromotionRepository(client),
  };
}

export class PrismaUnitOfWork implements UnitOfWork {
  async run<T>(
    operation: (repositories: TransactionRepositories) => Promise<T>,
  ) {
    return getPrisma().$transaction((transaction) =>
      operation(repositories(transaction)),
    );
  }
}
