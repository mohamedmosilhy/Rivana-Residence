import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { block } from "@/app/api/v1/_dto/inventory";
import { createBlock, listBlocks } from "@/composition/api";
import { BlockInput, BlockQuery } from "@/contracts/api/v1/inventory";

const ROUTE = "/api/v1/staff/branches/[id]/blocks";

// API-S24 GET: uncancelled blocks overlapping a window of at most 62 nights.
export const GET = staffRoute(
  { route: ROUTE, query: BlockQuery },
  async ({ staff, params, query, setBranch }) => {
    const branchId = String(params.id);
    setBranch(branchId);
    return toHttp(await listBlocks(staff, branchId, query), {
      ok: (blocks) => json(200, { items: blocks.map(block) }),
    });
  },
);

// API-S25 POST: creates a block (inventory:block) under the listing lock.
// Audited.
export const POST = staffRoute(
  { route: ROUTE, body: BlockInput },
  async ({ staff, params, body, setBranch }) => {
    const branchId = String(params.id);
    setBranch(branchId);
    return toHttp(await createBlock(staff, branchId, body), {
      ok: (created) =>
        json(201, block(created), {
          Location: `/api/v1/staff/blocks/${created.id}`,
        }),
    });
  },
);
