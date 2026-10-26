import { z } from "zod";

export const factorySchema = z.object({
  name: z.string().trim().min(1, "Factory name is required").max(120),
  country: z.string().trim().max(80).optional().default(""),
  city: z.string().trim().max(80).optional().default(""),
  contactPerson: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
});

export type FactoryInput = z.infer<typeof factorySchema>;
