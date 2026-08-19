/**
 * Campaign / entity / arc request schemas (#1394, epic #1369) for
 * `backend/src/routes/campaign/{campaigns,entities,arcs}.ts`. Grouped in one
 * module because all three are the same plain-REST, non-transaction pattern
 * (see each route file's own why-comment) rather than the discriminated-union
 * "op" shape `hp-ops.ts`/`condition-ops.ts` migrate.
 *
 * `ENTITY_TYPES`/`VISIBILITIES` move here too: entities.ts's own non-schema
 * uses (`parseEntityType`, the wire-type union) read them from here rather
 * than keeping a second local tuple — they are plain `as const` string
 * tuples, not a backend runtime const, so no `contracts` -> `backend`
 * boundary issue (unlike `campaign-items.ts`'s `GRANT_TYPES`/
 * `ITEM_RARITY_KEYS`, carved to #1773).
 *
 * Every exported `*Input` type is `z.input<typeof schema>`, this package's
 * locked policy (index.ts, #1395): `createArcSchema`/`updateArcSchema`'s
 * `.refine()` doesn't change the input/output shape, so `z.input` and
 * `z.infer` coincide there — still spelled `z.input` for uniformity.
 */
import { z } from "zod";

// --- campaigns.ts ---

// rulesEdition is optional (the Prisma column default applies when omitted).
// Never patchable after creation — there is no PATCH /campaigns/:id route.
//
// This literal can't derive from `RulesEdition`/`ALL_RULES_EDITIONS`
// (backend `lib/rules/edition.ts`, #1527): the package boundary
// (.fallowrc.jsonc) forbids `contracts` from importing ANYTHING zoned, not
// even `shared-types` type-only — see the boundary comment there, point 5.
// So the "adding a 3rd RulesEdition member is a compile error" guarantee for
// THIS site lives on the backend side of the boundary instead, as an
// `expectTypeOf` latch in campaign-op-contract.test.ts asserting this field's
// type against `RulesEdition` (mirrors this package's existing z.input/
// z.output latches, e.g. preferences-ops.ts) — update this array AND that
// latch together.
export const createCampaignSchema = z
  .object({ name: z.string().min(1), rulesEdition: z.enum(["EDITION_2014", "EDITION_2024"]).optional() })
  .strict();
export type CreateCampaignInput = z.input<typeof createCampaignSchema>;

export const joinCampaignSchema = z.object({ inviteCode: z.string().min(1) }).strict();
export type JoinCampaignInput = z.input<typeof joinCampaignSchema>;

export const attachCharacterSchema = z.object({ characterId: z.string().min(1) }).strict();
export type AttachCharacterInput = z.input<typeof attachCharacterSchema>;

// --- entities.ts ---

export const ENTITY_TYPES = ["NPC", "LOCATION", "FACTION", "ITEM", "PC", "OTHER"] as const;
export const VISIBILITIES = ["HIDDEN", "REVEALED"] as const;

export const createEntitySchema = z
  .object({
    type: z.enum(ENTITY_TYPES),
    name: z.string().min(1),
    aliases: z.array(z.string()).optional(),
    notes: z.string().optional(),
    // Owner-only (#379): a non-owner supplying this is rejected at the route.
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
    // Owner-only (#379); presence in a non-owner PATCH is rejected at the route.
    visibility: z.enum(VISIBILITIES),
  })
  .partial()
  .strict();
export type UpdateEntityInput = z.input<typeof updateEntitySchema>;

// Destructive typo-dedup (#1942): absorbs the :entityId duplicate into
// survivorEntityId. Owner-only, no note field — unlike prepareMergeSchema
// this isn't reversible prep, so there's nothing to annotate.
export const combineEntitiesSchema = z.object({ survivorEntityId: z.string().uuid() }).strict();
export type CombineEntitiesInput = z.input<typeof combineEntitiesSchema>;

// --- arcs.ts ---

export const createArcSchema = z.object({ name: z.string().min(1) }).strict();
export type CreateArcInput = z.input<typeof createArcSchema>;

export const updateArcSchema = z
  .object({ name: z.string().min(1).optional(), position: z.number().int().min(0).optional() })
  .strict()
  .refine((v) => v.name !== undefined || v.position !== undefined, {
    message: "Provide at least one of name or position",
  });
export type UpdateArcInput = z.input<typeof updateArcSchema>;
