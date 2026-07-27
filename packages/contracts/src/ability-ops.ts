/**
 * `ABILITY_REGISTRY` transaction-op schemas (backend/src/lib/classes/*.ts),
 * migrated one family at a time (#1370). Each op has exactly one declaration
 * here; the backend value-imports the schema and runs `.parse()`, and every
 * derived type is `z.infer` of that same schema — never a hand-written mirror.
 *
 * `warrior-of-elements` is deliberately excluded: its op types already live in
 * `packages/shared-types/src/class-resources.ts` (#1273), and its
 * `damageType` enum reads `ELEMENTAL_DAMAGE_TYPES`, a runtime const in
 * `backend/src/lib/classes/warrior-of-elements.ts` that this package may not
 * import (backend → contracts is one-directional). See the #1370 PR body /
 * follow-up issue for the shared-types/contracts overlap this leaves open.
 */
import { z } from "zod";

export const castChannelDivinityOpSchema = z.object({
  type: z.literal("castChannelDivinity"),
  abilityId: z.string().min(1),
});
export type CastChannelDivinityOperation = z.infer<typeof castChannelDivinityOpSchema>;
export type ChannelDivinityOperation = CastChannelDivinityOperation;

export const castManeuverOpSchema = z.object({
  type: z.literal("castManeuver"),
  entryId: z.string().min(1),
});
export type CastManeuverOperation = z.infer<typeof castManeuverOpSchema>;
export type ManeuverOperation = CastManeuverOperation;

export const castShadowArtOpSchema = z.object({
  type: z.literal("castShadowArt"),
  shadowArtId: z.string().min(1),
});
export type CastShadowArtOperation = z.infer<typeof castShadowArtOpSchema>;

export const activateCloakOfShadowsOpSchema = z.object({
  type: z.literal("activateCloakOfShadows"),
});
export type ActivateCloakOfShadowsOperation = z.infer<typeof activateCloakOfShadowsOpSchema>;

export type ShadowArtOperation = CastShadowArtOperation | ActivateCloakOfShadowsOperation;

export const attemptStunningStrikeOpSchema = z.object({
  type: z.literal("attemptStunningStrike"),
  usedThisTurn: z.boolean(),
});
export type AttemptStunningStrikeOperation = z.infer<typeof attemptStunningStrikeOpSchema>;
export type StunningStrikeOperation = AttemptStunningStrikeOperation;

export const rollSneakAttackOpSchema = z.object({
  type: z.literal("rollSneakAttack"),
  eligible: z.boolean(),
  usedThisTurn: z.boolean(),
});
export type RollSneakAttackOperation = z.infer<typeof rollSneakAttackOpSchema>;
export type SneakAttackOperation = RollSneakAttackOperation;

// Shared by open-hand-technique.ts (the rider a Flurry hit imposes) and
// frontend/src/types/character/classes.ts (api/abilities.ts's rider param) —
// the one enum in this file re-exported from BOTH tiers rather than just the
// frontend, since the backend has its own non-barrel consumer too.
export const openHandRiderSchema = z.enum(["addle", "push", "topple"]);
export type OpenHandRider = z.infer<typeof openHandRiderSchema>;

export const imposeOpenHandRiderOpSchema = z.object({
  type: z.literal("imposeOpenHandRider"),
  rider: openHandRiderSchema,
  usedThisTurn: z.boolean(),
});
export type ImposeOpenHandRiderOperation = z.infer<typeof imposeOpenHandRiderOpSchema>;
export type OpenHandTechniqueOperation = ImposeOpenHandRiderOperation;

export const setQuiveringPalmOpSchema = z.object({
  type: z.literal("setQuiveringPalm"),
});
export type SetQuiveringPalmOperation = z.infer<typeof setQuiveringPalmOpSchema>;

export const triggerQuiveringPalmOpSchema = z.object({
  type: z.literal("triggerQuiveringPalm"),
  roll: z.number().positive(),
});
export type TriggerQuiveringPalmOperation = z.infer<typeof triggerQuiveringPalmOpSchema>;

export type QuiveringPalmOperation = SetQuiveringPalmOperation | TriggerQuiveringPalmOperation;

export const dealHandOfHarmOpSchema = z.object({
  type: z.literal("dealHandOfHarm"),
  usedThisTurn: z.boolean(),
  roll: z.number().positive(),
  freeFromFlurry: z.boolean().optional(),
});
export type DealHandOfHarmOperation = z.infer<typeof dealHandOfHarmOpSchema>;
export type HandOfHarmOperation = DealHandOfHarmOperation;

export const useHandOfUltimateMercyOpSchema = z.object({
  type: z.literal("useHandOfUltimateMercy"),
  roll: z.number().positive(),
});
export type UseHandOfUltimateMercyOperation = z.infer<typeof useHandOfUltimateMercyOpSchema>;
export type HandOfUltimateMercyOperation = UseHandOfUltimateMercyOperation;
