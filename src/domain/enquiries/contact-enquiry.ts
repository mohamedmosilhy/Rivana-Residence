import { z } from "zod";

const containsMarkup = /<[^>]*>/;

export const contactEnquirySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((value) => !containsMarkup.test(value)),
  email: z.email().max(320),
  phone: z.string().trim().max(40).nullable(),
  subject: z.string().trim().max(160).nullable(),
  message: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .refine((value) => !containsMarkup.test(value)),
});
