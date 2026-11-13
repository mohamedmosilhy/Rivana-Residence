import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { serviceList } from "@/app/api/v1/_dto/commercial";
import { listServices } from "@/composition/api";

const ROUTE = "/api/v1/staff/branches/[id]/services";

// API-S35: both service kinds for one branch, absent kinds shown inactive.
export const GET = staffRoute(
  { route: ROUTE },
  async ({ staff, params, setBranch }) => {
    const id = String(params.id);
    setBranch(id);
    return toHttp(await listServices(staff, id), {
      ok: (entries) => json(200, serviceList(entries)),
    });
  },
);
