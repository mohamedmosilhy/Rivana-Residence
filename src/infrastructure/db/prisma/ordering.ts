import "server-only";

export function isCompleteOrder(
  orderedIds: readonly string[],
  rows: readonly Readonly<{ id: string }>[],
) {
  const requested = new Set(orderedIds);
  return (
    requested.size === orderedIds.length &&
    requested.size === rows.length &&
    rows.every((row) => requested.has(row.id))
  );
}
