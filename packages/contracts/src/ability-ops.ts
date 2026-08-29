import { z } from "zod";

// warrior-of-elements ops are excluded: their damageType enum reads ELEMENTAL_DAMAGE_TYPES from the backend, which this package may not import (contracts -> backend is forbidden, .fallowrc.jsonc boundaries).

/** `abilityId` is the catalog GrantedAbility.id. */
export const castChannelDivinityOpSchema = z.object({
  type: z.literal("castChannelDivinity"),
  abilityId: z.string().min(1),
});
export type CastChannelDivinityOperation = z.infer<typeof castChannelDivinityOpSchema>;
export type ChannelDivinityOperation = CastChannelDivinityOperation;

/** Cast a known maneuver: spends one superiority die, which the SERVER rolls. */
export const castManeuverOpSchema = z.object({
  type: z.literal("castManeuver"),
  entryId: z.string().min(1),
});
export type CastManeuverOperation = z.infer<typeof castManeuverOpSchema>;
export type ManeuverOperation = CastManeuverOperation;

/** Cast the Shadow Arts Darkness spell. `shadowArtId` is the catalog GrantedAbility.id. */
export const castShadowArtOpSchema = z.object({
  type: z.literal("castShadowArt"),
  shadowArtId: z.string().min(1),
});
export type CastShadowArtOperation = z.infer<typeof castShadowArtOpSchema>;

/** `entryId` is choicesKnown["fourElementsDisciplines"][].id (2014), not the catalog GrantedAbility.id; `roll` is the client's own computed damage total, omitted when the discipline deals none. */
export const castDisciplineOpSchema = z.object({
  type: z.literal("castDiscipline"),
  entryId: z.string().min(1),
  requestedKi: z.number().int().positive().optional(),
  // positive, not nonnegative: 0 is not a die face; mirrors resolveDisciplineCast's own roll guard.
  roll: z.number().positive().optional(),
});
export type CastDisciplineOperation = z.infer<typeof castDisciplineOpSchema>;
export type DisciplineOperation = CastDisciplineOperation;

/** No catalog id — unlike castShadowArt this is one fixed feature, not a granted-ability row. */
export const activateCloakOfShadowsOpSchema = z.object({
  type: z.literal("activateCloakOfShadows"),
});
export type ActivateCloakOfShadowsOperation = z.infer<typeof activateCloakOfShadowsOpSchema>;

export type ShadowArtOperation = CastShadowArtOperation | ActivateCloakOfShadowsOperation;

/** `usedThisTurn` is once-per-turn, client-asserted — the server has no session turn state to cross-check it against. */
export const attemptStunningStrikeOpSchema = z.object({
  type: z.literal("attemptStunningStrike"),
  usedThisTurn: z.boolean(),
});
export type AttemptStunningStrikeOperation = z.infer<typeof attemptStunningStrikeOpSchema>;
export type StunningStrikeOperation = AttemptStunningStrikeOperation;

export const openHandRiderSchema = z.enum(["addle", "push", "topple"]);
// OpenHandRider is also imported directly by the backend's open-hand-technique module — not frontend-only; don't remove as unused.
export type OpenHandRider = z.infer<typeof openHandRiderSchema>;

/** `usedThisTurn` is once-per-turn, client-asserted. */
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

/** Client-rolled 10d12 total; the server only validates positivity, it does not re-roll. */
export const triggerQuiveringPalmOpSchema = z.object({
  type: z.literal("triggerQuiveringPalm"),
  roll: z.number().positive(),
});
export type TriggerQuiveringPalmOperation = z.infer<typeof triggerQuiveringPalmOpSchema>;

export type QuiveringPalmOperation = SetQuiveringPalmOperation | TriggerQuiveringPalmOperation;

export const dealHandOfHarmOpSchema = z.object({
  type: z.literal("dealHandOfHarm"),
  /** Once per turn, client-asserted — no server-side turn state to cross-check. */
  usedThisTurn: z.boolean(),
  /** Client-rolled Martial Arts die + Wisdom modifier total (necrotic damage). */
  roll: z.number().positive(),
  /** Flurry of Healing and Harm (PHB'24 p.92): spends a free use from that pool instead of Focus; the once-per-turn limit above still applies. */
  freeFromFlurry: z.boolean().optional(),
});
export type DealHandOfHarmOperation = z.infer<typeof dealHandOfHarmOpSchema>;
export type HandOfHarmOperation = DealHandOfHarmOperation;

/** Client-rolled 4d10 + Wisdom modifier total; the server only validates positivity, it does not re-roll. */
export const useHandOfUltimateMercyOpSchema = z.object({
  type: z.literal("useHandOfUltimateMercy"),
  roll: z.number().positive(),
});
export type UseHandOfUltimateMercyOperation = z.infer<typeof useHandOfUltimateMercyOpSchema>;
export type HandOfUltimateMercyOperation = UseHandOfUltimateMercyOperation;

/** Eldritch Knight Weapon Bond (PHB'14 p.75): bondWeapon enforces the L3+ EK gate and 2-weapon cap server-side; unbondWeapon is always legal so a stuck row can clear. */
export const bondWeaponOpSchema = z.object({
  type: z.literal("bondWeapon"),
  inventoryItemId: z.string().min(1),
});
export type BondWeaponOperation = z.infer<typeof bondWeaponOpSchema>;

export const unbondWeaponOpSchema = z.object({
  type: z.literal("unbondWeapon"),
  inventoryItemId: z.string().min(1),
});
export type UnbondWeaponOperation = z.infer<typeof unbondWeaponOpSchema>;

export type WeaponBondOperation = BondWeaponOperation | UnbondWeaponOperation;
