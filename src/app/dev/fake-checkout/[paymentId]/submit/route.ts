import { readRawBody } from "@/app/api/v1/_http/body";
import { isSameOriginRequest } from "@/composition/http";
import {
  developmentPaymentCheckout,
  FAKE_CHECKOUT_ACTIONS,
} from "@/composition/payment-gateway";

const headers = { "Cache-Control": "no-store" };
const refundOutcomes = ["PENDING", "SUCCEEDED", "FAILED"] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const gateway = developmentPaymentCheckout();
  if (!gateway) return new Response(null, { status: 404, headers });
  const { paymentId } = await params;
  if (!gateway.readCheckout(paymentId))
    return new Response(null, { status: 404, headers });
  if (!isSameOriginRequest(request))
    return new Response(null, { status: 403, headers });

  const mediaType = request.headers.get("content-type")?.split(";")[0]?.trim();
  if (mediaType !== "application/x-www-form-urlencoded")
    return new Response(null, { status: 415, headers });
  const body = await readRawBody(request, 512);
  if (!body.ok) return new Response(null, { status: 413, headers });
  const form = new URLSearchParams(new TextDecoder().decode(body.value));
  const action = FAKE_CHECKOUT_ACTIONS.find(
    (candidate) => candidate === form.get("action"),
  );
  const refundOutcome = refundOutcomes.find(
    (candidate) => candidate === form.get("refundOutcome"),
  );
  if (
    !action ||
    form.getAll("action").length !== 1 ||
    form.getAll("refundOutcome").length > 1 ||
    (form.has("refundOutcome") && !refundOutcome) ||
    [...form.keys()].some((key) => key !== "action" && key !== "refundOutcome")
  )
    return new Response(null, { status: 422, headers });

  const simulation = gateway.simulate(paymentId, action, refundOutcome);
  const result =
    simulation.status === "callback"
      ? (await gateway.deliverCallback(simulation.event))
        ? "sent"
        : "delivery-failed"
      : simulation.status;

  return new Response(null, {
    status: 303,
    headers: {
      ...headers,
      Location: `/dev/fake-checkout/${encodeURIComponent(paymentId)}?result=${result}`,
    },
  });
}
