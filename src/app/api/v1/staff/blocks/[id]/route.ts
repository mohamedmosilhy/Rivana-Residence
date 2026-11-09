import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { block } from "@/app/api/v1/_dto/inventory";
import { cancelBlock, updateBlock } from "@/composition/api";
import { BlockPatch } from "@/contracts/api/v1/inventory";

const ROUTE = "/api/v1/staff/blocks/[id]";

// API-S26 PATCH: end date or note (inventory:block). Changing the end date
// takes the listing lock. Audited.
export const PATCH = staffRoute(
  { route: ROUTE, body: BlockPatch },
  async ({ staff, params, body }) =>
    toHttp(await updateBlock(staff, String(params.id), body), {
      ok: (updated) => json(200, block(updated)),
    }),
);

// API-S27 DELETE: soft cancellation. Repeating it succeeds. Audited.
export const DELETE = staffRoute({ route: ROUTE }, async ({ staff, params }) =>
  toHttp(await cancelBlock(staff, String(params.id)), {
    ok: () => new Response(null, { status: 204 }),
  }),
);
