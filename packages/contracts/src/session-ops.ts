import { z } from "zod";

export const patchSessionSchema = z
  .object({
    title: z.string().min(1).nullable().optional(),
    arcId: z.string().min(1).nullable().optional(),
  })
  .strict()
  .refine((v) => v.title !== undefined || v.arcId !== undefined, {
    message: "Provide at least one of title or arcId",
  });
export type PatchSessionInput = z.input<typeof patchSessionSchema>;
