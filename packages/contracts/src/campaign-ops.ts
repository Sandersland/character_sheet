import { z } from "zod";

// Write-once and optional (the Prisma column default applies when omitted); this literal must mirror the `RulesEdition` type union — sync enforced by expectTypeOf in campaign-op-contract.test.ts.
export const createCampaignSchema = z
  .object({ name: z.string().min(1), rulesEdition: z.enum(["EDITION_2014", "EDITION_2024"]).optional() })
  .strict();
export type CreateCampaignInput = z.input<typeof createCampaignSchema>;

export const joinCampaignSchema = z.object({ inviteCode: z.string().min(1) }).strict();
export type JoinCampaignInput = z.input<typeof joinCampaignSchema>;

export const attachCharacterSchema = z.object({ characterId: z.string().min(1) }).strict();
export type AttachCharacterInput = z.input<typeof attachCharacterSchema>;

export const ENTITY_TYPES = ["NPC", "LOCATION", "FACTION", "ITEM", "PC", "OTHER"] as const;
export const VISIBILITIES = ["HIDDEN", "REVEALED"] as const;

export const createEntitySchema = z
  .object({
    type: z.enum(ENTITY_TYPES),
    name: z.string().min(1),
    aliases: z.array(z.string()).optional(),
    notes: z.string().optional(),
    // Owner-only — rejected at the route for a non-owner.
    visibility: z.enum(VISIBILITIES).optional(),
  })
  .strict();
export type CreateEntityInput = z.input<typeof createEntitySchema>;

export const updateEntitySchema = z
  .object({
    type: z.enum(ENTITY_TYPES),
    name: z.string().min(1),
    aliases: z.array(z.string()),
    notes: z.string().nullable(),
    // Owner-only — presence in a non-owner PATCH is rejected at the route.
    visibility: z.enum(VISIBILITIES),
  })
  .partial()
  .strict();
export type UpdateEntityInput = z.input<typeof updateEntitySchema>;

// Owner-only; absorbs every loserEntityIds duplicate into survivorEntityId atomically.
export const combineEntitiesSchema = z
  .object({
    survivorEntityId: z.string().uuid(),
    loserEntityIds: z.array(z.string().uuid()).min(1),
  })
  .strict()
  .refine((v) => !v.loserEntityIds.includes(v.survivorEntityId), {
    message: "loserEntityIds must not include survivorEntityId",
    path: ["loserEntityIds"],
  })
  .refine((v) => new Set(v.loserEntityIds).size === v.loserEntityIds.length, {
    message: "loserEntityIds must not contain duplicates",
    path: ["loserEntityIds"],
  });
export type CombineEntitiesInput = z.input<typeof combineEntitiesSchema>;

export const createArcSchema = z.object({ name: z.string().min(1) }).strict();
export type CreateArcInput = z.input<typeof createArcSchema>;

export const updateArcSchema = z
  .object({ name: z.string().min(1).optional(), position: z.number().int().min(0).optional() })
  .strict()
  .refine((v) => v.name !== undefined || v.position !== undefined, {
    message: "Provide at least one of name or position",
  });
export type UpdateArcInput = z.input<typeof updateArcSchema>;
