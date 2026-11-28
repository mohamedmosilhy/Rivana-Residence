import type { z } from "zod";

import type { RoomTypeList } from "@/contracts/api/v1/branches";

import { send } from "./request";
import type { ApiSuccess, CallOptions } from "./result";

/** API-P3: the branch's published listings. It says nothing about availability. */
export function listBranchListings(
  branchSlug: string,
  options: CallOptions = {},
) {
  return send<ApiSuccess<200, z.output<typeof RoomTypeList>>>({
    ...options,
    method: "GET",
    path: ["branches", branchSlug, "room-types"],
    expect: [200],
  });
}
