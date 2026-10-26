import { z } from "zod";

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required").max(120),
  country: z.string().trim().max(80).optional().default(""),
  tier: z.enum(["Key Account", "Retail Brand", "Boutique", "Wholesale"]).optional().default("Wholesale"),
  primaryContact: z.string().trim().max(80).optional().default(""),
  email: z
    .string()
    .trim()
    .max(120)
    .optional()
    .default("")
    .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "Enter a valid email"),
});

export type CustomerInput = z.infer<typeof customerSchema>;
