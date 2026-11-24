/** Pages read per run. A run therefore looks at up to `batch * SWEEP_PAGES` items. */
export const SWEEP_PAGES = 5;

/**
 * Reads a bounded, oldest first backlog page by page. Every item seen in this
 * run is excluded from the next read, so an item that keeps failing or stays
 * pending cannot hold the head of the queue and block newer items, and an item
 * is never handled twice in one run. Stops at the first short page.
 */
export async function sweepInPages<Item extends Readonly<{ id: string }>>(
  batch: number,
  find: (exclude: readonly string[]) => Promise<readonly Item[]>,
  handle: (item: Item) => Promise<void>,
): Promise<void> {
  const seen: string[] = [];
  for (let page = 0; page < SWEEP_PAGES; page += 1) {
    const items = await find([...seen]);
    for (const item of items) {
      seen.push(item.id);
      await handle(item);
    }
    if (items.length < batch) return;
  }
}
