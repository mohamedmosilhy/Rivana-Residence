import { availabilityResponse } from "@/app/api/v1/_dto/availability";
import { json, problem, publicRoute, toHttp } from "@/app/api/v1/_http";
import {
  availabilityInput,
  duplicateAvailabilityFields,
} from "@/app/api/v1/_query/availability";
import { AVAILABILITY_RATE_LIMIT } from "@/application/shared/public-rate-limit-policy";
import { searchPublicAvailability } from "@/composition/api";
import { AvailabilityQuery } from "@/contracts/api/v1/availability";

// API-P5. No cache, hold or inventory lock. Admission is global across branches.
export const GET = publicRoute(
  {
    route: "/api/v1/branches/[branchSlug]/availability",
    query: AvailabilityQuery,
    rateLimit: AVAILABILITY_RATE_LIMIT,
  },
  async ({ request, params, query, requestId, setBranch }) => {
    const duplicates = duplicateAvailabilityFields(request);
    if (duplicates)
      return problem("INVALID_QUERY", { requestId, fieldErrors: duplicates });
    return toHttp(
      await searchPublicAvailability(
        String(params.branchSlug),
        availabilityInput(query),
      ),
      {
        ok: (value) => {
          setBranch(value.branchId);
          return json(200, availabilityResponse(value));
        },
      },
    );
  },
);
