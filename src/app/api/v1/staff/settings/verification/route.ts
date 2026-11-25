import { json, staffRoute, toHttp } from "@/app/api/v1/_http";
import { verificationSettings } from "@/app/api/v1/_dto/verification-settings";
import {
  readVerificationSettings,
  updateVerificationSettings,
} from "@/composition/api";
import { VerificationSettingsInput } from "@/contracts/api/v1/verification-settings";

const ROUTE = "/api/v1/staff/settings/verification";

// API-A9: the Admin switch for verification codes by email (Q-99).
export const GET = staffRoute({ route: ROUTE }, async ({ staff }) =>
  toHttp(await readVerificationSettings(staff), {
    ok: (view) => json(200, verificationSettings(view)),
  }),
);

export const PUT = staffRoute(
  { route: ROUTE, body: VerificationSettingsInput },
  async ({ staff, body }) =>
    toHttp(await updateVerificationSettings(staff, body), {
      ok: (view) => json(200, verificationSettings(view)),
    }),
);
