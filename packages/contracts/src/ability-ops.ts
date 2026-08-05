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

/**
 * Cast a known Way of the Four Elements discipline (2014, #1503). `entryId` is
 * the KNOWN entry's id (choicesKnown["fourElementsDisciplines"][].id, not the
 * catalog GrantedAbility.id — mirrors castManeuver's entryId). `requestedKi`
 * overspends above the discipline's base ki cost to scale its damage dice
 * (EffectScaling "poolStep"); omitted spends the base cost. `roll` is the
 * client-computed damage total for a discipline that deals damage (mirrors
 * castSpell/castElementalBurst: the client rolls its own supernatural effect,
 * trusted server-side) — omitted for a discipline with no damage roll.
 */
export const castDisciplineOpSchema = z.object({
  type: z.literal("castDiscipline"),
  entryId: z.string().min(1),
  requestedKi: z.number().int().positive().optional(),
  // .positive(), not .nonnegative() — matches every sibling roll field in
  // this file (castElementalBurst/triggerQuiveringPalm/dealHandOfHarm/
  // useHandOfUltimateMercy). 0 is never legitimate: the minimum roll on any
  // discipline's dice (e.g. 1d10) is 1, and disciplines.ts's own server-side
  // check already rejects roll <= 0 for a damage discipline — this just
  // catches the same rule one layer earlier, with a clearer validation error.
  roll: z.number().positive().optional(),
});
export type CastDisciplineOperation = z.infer<typeof castDisciplineOpSchema>;
export type DisciplineOperation = CastDisciplineOperation;

/**
 * Activate Cloak of Shadows (L17): spend 3 focus, become invisible. No catalog
 * id — unlike castShadowArt this is one fixed feature, not a granted-ability row.
 */
export const activateCloakOfShadowsOpSchema = z.object({
  type: z.literal("activateCloakOfShadows"),
});
export type ActivateCloakOfShadowsOperation = z.infer<typeof activateCloakOfShadowsOpSchema>;

export type ShadowArtOperation = CastShadowArtOperation | ActivateCloakOfShadowsOperation;

/**
 * `usedThisTurn` is once-per-turn, client-asserted (mirrors rollSneakAttack) —
 * the server has no session turn state to cross-check it against.
 */
export const attemptStunningStrikeOpSchema = z.object({
  type: z.literal("attemptStunningStrike"),
  usedThisTurn: z.boolean(),
});
export type AttemptStunningStrikeOperation = z.infer<typeof attemptStunningStrikeOpSchema>;
export type StunningStrikeOperation = AttemptStunningStrikeOperation;

/**
 * `eligible` is the player's manual advantage-or-adjacent-ally assertion, never
 * auto-detected; `usedThisTurn` is the client turn tracker's guard state. Both
 * are unverifiable server-side — there is no session turn state to check.
 */
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

/** `usedThisTurn` is once-per-turn, client-asserted (mirrors attemptStunningStrike). */
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

/**
 * Roll ownership: the 10d12 is the monk's own supernatural effect, so the client
 * rolls it and sends the total; the server only validates positivity and
 * narrates it. Same split as useHandOfUltimateMercy and dealHandOfHarm.
 */
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
  /**
   * Flurry of Healing and Harm (L11, PHB'24 p.92): spend a free use from that
   * pool instead of the base Focus pool. Still requires a level 11+ Warrior of
   * Mercy; the once-per-turn limit above still applies.
   */
  freeFromFlurry: z.boolean().optional(),
});
export type DealHandOfHarmOperation = z.infer<typeof dealHandOfHarmOpSchema>;
export type HandOfHarmOperation = DealHandOfHarmOperation;

/**
 * Roll ownership: 4d10 + Wisdom modifier is the monk's own supernatural effect,
 * so — like triggerQuiveringPalm's 10d12 — the client rolls it and sends the
 * total; the server only validates positivity.
 */
export const useHandOfUltimateMercyOpSchema = z.object({
  type: z.literal("useHandOfUltimateMercy"),
  roll: z.number().positive(),
});
export type UseHandOfUltimateMercyOperation = z.infer<typeof useHandOfUltimateMercyOpSchema>;
export type HandOfUltimateMercyOperation = UseHandOfUltimateMercyOperation;
