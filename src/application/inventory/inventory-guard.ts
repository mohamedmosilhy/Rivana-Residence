import type { ReservationUnitOfWork } from "@/application/reservations";
import {
  failure,
  inventoryUnavailable,
  success,
  type Result,
} from "@/application/shared/result";
import {
  checkInventoryReduction,
  type InventoryReductionInput,
  type InventoryReductionResult,
} from "@/domain/inventory";

import type { InventoryLock } from "./ports";

type AllowedReduction = Extract<
  InventoryReductionResult,
  Readonly<{ allowed: true }>
>;

export function validateInventoryReduction(
  roomTypeId: string,
  input: InventoryReductionInput,
): Result<AllowedReduction> {
  const checked = checkInventoryReduction(input);
  if (checked.allowed) return success(checked);

  if (checked.reason === "CAPACITY") {
    return inventoryUnavailable(
      roomTypeId,
      checked.firstUnavailableNight.value,
    );
  }
  if (checked.reason === "BLOCK_OVERLAP") {
    return failure(
      "CONFLICT",
      "This unit already has a block on those dates.",
      {
        startDate: ["Choose dates that do not overlap an active block."],
      },
    );
  }
  return failure(
    "CONFLICT",
    "This unit is assigned during the proposed inventory change.",
  );
}

export type InventoryGuardContext = Readonly<{
  inventoryLock: InventoryLock;
}>;

/**
 * Work that must hold its locks before any listing lock (the guest row, spec
 * 0005 Decision 1). `done` ends the operation early with a final value, for
 * example an idempotent replay, without locking any listing.
 */
export type InventoryGuardPreparation<Prepared, Value> = Readonly<
  { done: false; prepared: Prepared } | { done: true; value: Value }
>;

export type InventoryGuardOperation<
  Context,
  State,
  Checked,
  Value,
  Prepared = undefined,
> = Readonly<{
  branchId: string;
  roomTypeIds: readonly string[];
  /** Runs in the same transaction, before the listing lock. Omit when not needed. */
  prepare?(
    context: Context,
  ): Promise<Result<InventoryGuardPreparation<Prepared, Value>>>;
  /** Reloads mutable state and consumption only after the listing lock is held. */
  load(context: Context, prepared: Prepared): Promise<Result<State>>;
  validate(state: State): Result<Checked>;
  mutate(
    context: Context,
    state: State,
    checked: Checked,
  ): Promise<Result<Value>>;
  /** Audit is sequenced after the write and remains inside the transaction. */
  audit(context: Context, state: State, value: Value): Promise<void>;
}>;

/** The only transaction sequence used by availability reducing writes. */
export class InventoryGuard<Context extends InventoryGuardContext> {
  constructor(private readonly unitOfWork: ReservationUnitOfWork<Context>) {}

  execute<State, Checked, Value, Prepared = undefined>(
    operation: InventoryGuardOperation<
      Context,
      State,
      Checked,
      Value,
      Prepared
    >,
  ): Promise<Result<Value>> {
    return this.unitOfWork.run(async (context) => {
      let prepared = undefined as Prepared;
      if (operation.prepare) {
        const preparation = await operation.prepare(context);
        if (!preparation.ok) return preparation;
        if (preparation.value.done) return success(preparation.value.value);
        prepared = preparation.value.prepared;
      }

      const locked = await context.inventoryLock.lockRoomTypes(
        operation.branchId,
        operation.roomTypeIds,
      );
      if (!locked.ok) return locked;

      const loaded = await operation.load(context, prepared);
      if (!loaded.ok) return loaded;

      const checked = operation.validate(loaded.value);
      if (!checked.ok) return checked;

      const mutated = await operation.mutate(
        context,
        loaded.value,
        checked.value,
      );
      if (!mutated.ok) return mutated;

      await operation.audit(context, loaded.value, mutated.value);
      return mutated;
    });
  }
}
