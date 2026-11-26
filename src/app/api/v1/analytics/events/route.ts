import { publicRoute } from "@/app/api/v1/_http";
import { ANALYTICS_RATE_LIMIT } from "@/application/shared/public-rate-limit-policy";
import { recordSiteEvent } from "@/composition/analytics";
import { AnalyticsEventRequest } from "@/contracts/api/v1/analytics";

export const POST = publicRoute(
  {
    route: "/api/v1/analytics/events",
    body: AnalyticsEventRequest,
    acceptTextJson: true,
    serverRequestId: true,
    rateLimit: ANALYTICS_RATE_LIMIT,
  },
  async ({ body, request }) => {
    await recordSiteEvent(
      { sessionId: body.sessionId.toLowerCase(), events: body.events },
      request,
    );
    return new Response(null, { status: 204 });
  },
);
