import "server-only";

import type {
  MediaAssignment,
  MediaReference,
} from "@/application/ports/repositories";
import { failure, success, type Result } from "@/application/shared/result";
import type { DatabaseClient } from "@/infrastructure/db/prisma/transaction";

export async function resolveMediaAssignments(
  client: DatabaseClient,
  assignments: readonly MediaAssignment[],
): Promise<Result<readonly MediaReference[]>> {
  const slots = new Set(assignments.map((a) => `${a.role}:${a.sortOrder}`));
  if (slots.size !== assignments.length) {
    return failure(
      "VALIDATION",
      "Each media role and position may be used only once.",
    );
  }

  const ids = [...new Set(assignments.map((a) => a.mediaId))];
  const rows = await client.mediaAsset.findMany({
    where: { id: { in: ids }, status: { in: ["PENDING", "READY"] } },
    select: {
      id: true,
      status: true,
      altText: true,
      storageKey: true,
      rightsStatus: true,
      width: true,
      height: true,
      focalX: true,
      focalY: true,
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (byId.size !== ids.length) {
    return failure(
      "VALIDATION",
      "Media must reference existing assets that are not failed or deleted.",
    );
  }

  return success(
    assignments.map((assignment) => {
      const asset = byId.get(assignment.mediaId)!;
      return {
        id: asset.id,
        role: assignment.role,
        sortOrder: assignment.sortOrder,
        status: asset.status,
        altText: asset.altText,
        altOverride: assignment.altOverride,
        storageKey: asset.storageKey,
        rightsConfirmed: asset.rightsStatus === "CONFIRMED",
        width: asset.width,
        height: asset.height,
        focalX: asset.focalX === null ? null : asset.focalX.toNumber(),
        focalY: asset.focalY === null ? null : asset.focalY.toNumber(),
      };
    }),
  );
}

/** Confirms a single referenced image exists and is READY. */
export async function requireReadyImage(
  client: DatabaseClient,
  mediaId: string,
): Promise<Result<void>> {
  const count = await client.mediaAsset.count({
    where: { id: mediaId, status: "READY" },
  });
  return count === 1
    ? success(undefined)
    : failure("VALIDATION", "Choose an image that has finished uploading.", {
        image: ["Choose an image that has finished uploading."],
      });
}
