import { z } from "zod";

export const catalogGrantSchema = z
  .object({
    campaignId: z.string().min(1),
  })
  .strict();
export type CatalogGrantInput = z.input<typeof catalogGrantSchema>;

// The cross-field constraint below is structural (request shape), not a 5e rule — rules validation never lives in a contract schema.
export const catalogForkSchema = z
  .object({
    scope: z.enum(["USER", "CAMPAIGN"]),
    campaignId: z.string().min(1).optional(),
  })
  .strict()
  .refine((v) => (v.scope === "CAMPAIGN") === (v.campaignId !== undefined), {
    message: "campaignId is required when scope is CAMPAIGN, and forbidden when scope is USER",
    path: ["campaignId"],
  });
export type CatalogForkInput = z.input<typeof catalogForkSchema>;
