/**
 * Decomposed-roll-addend zod validators for `RollEventAttackComponents` /
 * `RollEventDamageComponents` (shared-types roll-event.ts) — the ONE
 * validation for a shape TWO callers accept over the wire: the roll-log route
 * (`routes/session/session-route-helpers.ts`, `POST .../sessions/:id/roll`)
 * and the `resolveAction` op (`lib/combat/resolve-action-ops.ts`, #1829/#1830).
 * Lives in lib (not routes) so a lib module can depend on it without a
 * lib→routes inversion.
 */
import { z } from "zod";

// `.strict()` rejects unknown keys — these persist verbatim into a durable
// event log, so an attacker-supplied extra key (or script payload) must 400,
// not ride along.
export const attackComponentsSchema = z
  .object({
    abilityMod: z.number().finite(),
    proficiencyBonus: z.number().finite(),
    rangedBonus: z.number().finite(),
    attackRollBonus: z.number().finite(),
    // The ability abilityMod is drawn from (#1361) — an ability key, not
    // validated against the ability list (matches RollEventModeSource.ability's
    // existing treatment of unvalidated persisted JSON).
    ability: z.string().optional(),
  })
  .strict();

export const damageComponentsSchema = z
  .object({
    abilityMod: z.number().finite(),
    meleeDamageBonus: z.number().finite(),
    ability: z.string().optional(),
  })
  .strict();
