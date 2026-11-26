import { z } from "zod";

/** Optional on P5, P6, P9 and P10. P7 takes the same value in its body. */
export const AnalyticsSessionHeader = {
  name: "Rivana-Analytics-Session",
  required: false,
  description:
    "The browser's anonymous website visit id: 32 hexadecimal characters. Used only for the website report. Any other value is ignored and never causes an error.",
  schema: z.string(),
} as const;

const eventFields = {
  path: z.string().max(200).regex(/^\//, "Use a path starting with /."),
  branchSlug: z
    .string()
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  roomSlug: z
    .string()
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  referrer: z.string().optional(),
  utm: z
    .strictObject({
      source: z.string().optional(),
      medium: z.string().optional(),
      campaign: z.string().optional(),
    })
    .optional(),
};

const pageView = z.strictObject({
  name: z.literal("PAGE_VIEW"),
  ...eventFields,
});
const stepView = z.strictObject({
  name: z.literal("STEP_VIEW"),
  step: z.enum([
    "SEARCH",
    "DETAILS",
    "VERIFY",
    "EXTRAS",
    "PAYMENT",
    "REVIEW",
    "CONFIRMED",
    "PAYMENT_RETURN",
    "MANAGE",
    "FIND",
    "CHANGE",
  ]),
  ...eventFields,
});

export const AnalyticsEventRequest = z.strictObject({
  sessionId: z
    .string()
    .regex(/^[0-9a-fA-F]{32}$/, "Use a 32 character hexadecimal session ID."),
  events: z.array(z.discriminatedUnion("name", [pageView, stepView])).max(20),
});
