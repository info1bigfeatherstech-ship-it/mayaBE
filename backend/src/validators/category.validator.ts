import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Category name is required").max(80),
  description: z.string().trim().max(500).optional().default(""),
  parentId: z
    .string()
    .nullish()
    .transform((value) => {
      const next = (value || "").trim();
      return next && next !== "root" ? next : null;
    }),
});

export type CategoryInput = z.infer<typeof categorySchema>;
