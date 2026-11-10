import { z } from "zod";

import { DomainValidationError } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { StayRange } from "@/domain/shared/stay-range";

import {
  inventoryByNight,
  type NightAvailability,
  type NightInventory,
} from "./availability-calculator";

export type InventoryBlockRange = Readonly<{ id: string; range: StayRange }>;

export type CapacityReductionChange =
  | Readonly<{ kind: "BLOCK"; range: StayRange; replaceBlockId?: string }>
  | Readonly<{ kind: "DEACTIVATE"; from: LocalDate }>;

export type InventoryReductionInput = Readonly<{
  unit: Readonly<{ active: boolean; blocks: readonly InventoryBlockRange[] }>;
  change: CapacityReductionChange;
  /** Sparse current counts: no generated rows for empty dates. */
  nights: readonly NightInventory[];
  /** Consuming assignments on this specific unit, supplied by the caller. */
  assignments: readonly StayRange[];
}>;

export type ReductionConflict = Readonly<{
  reason: "BLOCK_OVERLAP" | "UNIT_ASSIGNED" | "CAPACITY";
  firstUnavailableNight: LocalDate;
}>;

export type InventoryReductionResult =
  | Readonly<{ allowed: true; projectedNights: readonly NightAvailability[] }>
  | (ReductionConflict &
      Readonly<{
        allowed: false;
        projectedNights: readonly NightAvailability[];
      }>);

function covers(range: StayRange, night: LocalDate) {
  return range.checkIn.compare(night) <= 0 && night.compare(range.checkOut) < 0;
}

function later(left: LocalDate, right: LocalDate) {
  return left.compare(right) >= 0 ? left : right;
}

function validateState(input: InventoryReductionInput) {
  if (!z.boolean().safeParse(input.unit.active).success) {
    throw new DomainValidationError("The unit activity state is invalid.", [
      { path: "unit.active", message: "Supply a boolean activity state." },
    ]);
  }
  const ids = new Set<string>();
  for (const block of input.unit.blocks) {
    if (!block.id || ids.has(block.id) || !(block.range instanceof StayRange)) {
      throw new DomainValidationError("The current block state is invalid.", [
        {
          path: "unit.blocks",
          message: "Supply unique block ids and valid ranges.",
        },
      ]);
    }
    ids.add(block.id);
  }
  if (input.assignments.some((range) => !(range instanceof StayRange))) {
    throw new DomainValidationError("The assignment state is invalid.", [
      {
        path: "assignments",
        message: "Supply valid consuming assignment ranges.",
      },
    ]);
  }
  const change = input.change;
  if (
    (change.kind !== "BLOCK" && change.kind !== "DEACTIVATE") ||
    (change.kind === "BLOCK" &&
      (!(change.range instanceof StayRange) ||
        (change.replaceBlockId !== undefined &&
          !ids.has(change.replaceBlockId)))) ||
    (change.kind === "DEACTIVATE" && !(change.from instanceof LocalDate))
  ) {
    throw new DomainValidationError(
      "The proposed inventory change is invalid.",
      [
        {
          path: "change",
          message: "Supply a valid change and an existing replacement id.",
        },
      ],
    );
  }
}

/** Pure projection only. The application must load its inputs under the listing lock. */
export function checkInventoryReduction(
  input: InventoryReductionInput,
): InventoryReductionResult {
  validateState(input);
  const indexed = inventoryByNight(input.nights);
  const change = input.change;
  const conflicts: ReductionConflict[] = [];
  const before = input.unit.blocks.map((block) => block.range);
  const after =
    change.kind === "BLOCK"
      ? input.unit.blocks
          .filter((block) => block.id !== change.replaceBlockId)
          .map((block) => block.range)
      : before;

  if (change.kind === "BLOCK") {
    for (const range of after) {
      if (range.overlaps(change.range)) {
        conflicts.push({
          reason: "BLOCK_OVERLAP",
          firstUnavailableNight: later(range.checkIn, change.range.checkIn),
        });
      }
    }
    after.push(change.range);
  }

  for (const range of input.assignments) {
    if (change.kind === "BLOCK" && range.overlaps(change.range)) {
      conflicts.push({
        reason: "UNIT_ASSIGNED",
        firstUnavailableNight: later(range.checkIn, change.range.checkIn),
      });
    } else if (
      change.kind === "DEACTIVATE" &&
      input.unit.active &&
      range.checkOut.compare(change.from) > 0
    ) {
      conflicts.push({
        reason: "UNIT_ASSIGNED",
        firstUnavailableNight: later(range.checkIn, change.from),
      });
    }
  }

  const projected: NightAvailability[] = [];
  for (const row of indexed.values()) {
    if (
      row.sold === 0 ||
      (change.kind === "BLOCK" && !covers(change.range, row.night)) ||
      (change.kind === "DEACTIVATE" && row.night.compare(change.from) < 0)
    ) {
      continue;
    }
    const beforeContributes =
      input.unit.active && !before.some((range) => covers(range, row.night));
    const afterContributes =
      change.kind === "BLOCK" &&
      input.unit.active &&
      !after.some((range) => covers(range, row.night));
    const capacity =
      row.capacity + (Number(afterContributes) - Number(beforeContributes));
    if (!Number.isSafeInteger(capacity) || capacity < 0) {
      throw new DomainValidationError(
        "The unit and capacity snapshot disagree.",
        [
          {
            path: "nights",
            message: "Supply counts that include the active, unblocked unit.",
          },
        ],
      );
    }
    const free = capacity - row.sold;
    projected.push(
      Object.freeze({ night: row.night, capacity, sold: row.sold, free }),
    );
    if (free < 0) {
      conflicts.push({ reason: "CAPACITY", firstUnavailableNight: row.night });
    }
  }
  projected.sort((left, right) => left.night.compare(right.night));
  conflicts.sort((left, right) =>
    left.firstUnavailableNight.compare(right.firstUnavailableNight),
  );
  const projectedNights = Object.freeze(projected);
  const first = conflicts[0];
  return first
    ? Object.freeze({ allowed: false, ...first, projectedNights })
    : Object.freeze({ allowed: true, projectedNights });
}
