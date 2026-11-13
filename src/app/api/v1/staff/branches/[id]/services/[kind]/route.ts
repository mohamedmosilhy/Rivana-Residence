import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { serviceOffering } from "@/app/api/v1/_dto/commercial";
import { setService } from "@/composition/api";
import { ServiceOfferingInput } from "@/contracts/api/v1/commercial";

const ROUTE = "/api/v1/staff/branches/[id]/services/[kind]";

// API-S36: create or replace one branch service offering. Audited.
export const PUT = staffRoute(
  { route: ROUTE, body: ServiceOfferingInput },
  async ({ staff, params, body, setBranch }) => {
    const id = String(params.id);
    setBranch(id);
    return toHttp(await setService(staff, id, String(params.kind), body), {
      ok: (offering) => json(200, serviceOffering(offering.kind, offering)),
    });
  },
);
