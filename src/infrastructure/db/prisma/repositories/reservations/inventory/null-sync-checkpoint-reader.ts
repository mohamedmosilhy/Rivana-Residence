import "server-only";

import type { LastSyncCheckpointReader } from "@/application/inventory";

/** M6 stores no sync checkpoint. M8 replaces this adapter. */
export class NullLastSyncCheckpointReader implements LastSyncCheckpointReader {
  async read(_branchId: string): Promise<Date | null> {
    void _branchId;
    return null;
  }
}
