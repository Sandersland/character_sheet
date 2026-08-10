import { z } from "zod";
import {
  activateCloakOfShadowsOpSchema,
  attemptStunningStrikeOpSchema,
  bondWeaponOpSchema,
  castChannelDivinityOpSchema,
  castDisciplineOpSchema,
  castManeuverOpSchema,
  castShadowArtOpSchema,
  dealHandOfHarmOpSchema,
  imposeOpenHandRiderOpSchema,
  rollSneakAttackOpSchema,
  setQuiveringPalmOpSchema,
  triggerQuiveringPalmOpSchema,
  unbondWeaponOpSchema,
  useHandOfUltimateMercyOpSchema,
} from "@character-sheet/contracts";

import type { TransactionHandler } from "@/lib/http/transactions-endpoint.js";
import { InvalidSpellcastingOperationError } from "@/lib/spellcasting/ability-cost.js";
import {
  applyChannelDivinityOperations,
  InvalidChannelDivinityOperationError,
} from "./channel-divinity.js";
import { applyDisciplineOperations, InvalidDisciplineOperationError } from "./disciplines.js";
import { applyHandOfHarmOperations, InvalidHandOfHarmOperationError } from "./hand-of-harm.js";
import {
  applyHandOfUltimateMercyOperations,
  InvalidHandOfUltimateMercyOperationError,
} from "./hand-of-ultimate-mercy.js";
import { applyManeuverOperations, InvalidManeuverOperationError } from "./maneuvers.js";
import {
  applyOpenHandTechniqueOperations,
  InvalidOpenHandTechniqueOperationError,
} from "./open-hand-technique.js";
import { applyQuiveringPalmOperations, InvalidQuiveringPalmOperationError } from "./quivering-palm.js";
import { InvalidResourceOperationError } from "./resources.js";
import { applyShadowArtsOperations, InvalidShadowArtOperationError } from "./shadow-arts.js";
import { applySneakAttackOperations, InvalidSneakAttackOperationError } from "./sneak-attack.js";
import { applyStunningStrikeOperations, InvalidStunningStrikeOperationError } from "./stunning-strike.js";
import {
  applyWarriorOfElementsOperations,
  ELEMENTAL_DAMAGE_TYPES,
  InvalidWarriorOfElementsOperationError,
} from "./warrior-of-elements.js";
import { applyWeaponBondOperations, InvalidWeaponBondOperationError } from "./weapon-bond.js";

const elementalDamageTypeSchema = z.enum(ELEMENTAL_DAMAGE_TYPES);

// Every ability takes the same envelope — a non-empty batch of ops discriminated
// on `type` — so the entries below differ only in their op shapes.
function opBatch<Options extends readonly [z.ZodObject, ...z.ZodObject[]]>(...options: Options) {
  return z.object({ operations: z.array(z.discriminatedUnion("type", options)).min(1) });
}

// Erases each entry's <Schema, Result> pair so they can share one Record while
// `apply`/`respond` still see their own parsed types. No cast is needed because
// TransactionHandler declares those two as methods, which TS checks bivariantly.
function defineAbility<Schema extends z.ZodTypeAny, Result>(
  handler: TransactionHandler<Schema, Result>,
): TransactionHandler {
  return handler;
}

/**
 * Every class/subclass ability the sheet automates, keyed by URL segment for the
 * shared `POST /api/characters/:id/abilities/:abilityKey/transactions` endpoint
 * (#1275). Adding an automated feature is a rules module plus one entry here —
 * no route file, no mount, no new client export.
 *
 * Invariant: `abilityKey` is the basename of the ability's rules module in this
 * directory, so the URL names the file that implements it.
 *
 * Despite the name, unrelated to `deriveResources`/`deriveEntryScopedResources`
 * and their dispatch tables, which derive class/subclass state rather than
 * serving HTTP transactions.
 */
export const ABILITY_REGISTRY: Record<string, TransactionHandler> = {
  // castChannelDivinity — spend 1 CD charge; apply the option's real side effect
  // (Sacred Weapon attack buff, Cloak of Shadows invisibility) or reminder/DC.
  // The entitled-options picker stays a GET on channelDivinityRouter.
  "channel-divinity": defineAbility({
    schema: opBatch(castChannelDivinityOpSchema),
    apply: (characterId, data) => applyChannelDivinityOperations(characterId, data.operations),
    domainErrors: [
      InvalidChannelDivinityOperationError,
      InvalidResourceOperationError,
      InvalidSpellcastingOperationError,
    ],
  }),

  // castDiscipline — Way of the Four Elements (2014-only, #1503): spend 2-6
  // ki (per-cast cap by monk level) to cast a known elemental discipline —
  // reshape a spell (Thunderwave/Burning Hands/Fireball/…) as the discipline's
  // own effect. The client rolls a discipline's damage (mirrors castSpell);
  // the server validates the ki spend and, for a concentrating discipline,
  // establishes concentration. The known-discipline picker stays a GET on
  // the generic /api/subclass-choices/discipline route (#899/#1412).
  "disciplines": defineAbility({
    schema: opBatch(castDisciplineOpSchema),
    apply: (characterId, data) => applyDisciplineOperations(characterId, data.operations),
    domainErrors: [InvalidDisciplineOperationError, InvalidResourceOperationError, InvalidSpellcastingOperationError],
  }),

  // Once per turn, spends 1 Focus (or a Flurry of Healing and Harm free use at
  // L11+, via `freeFromFlurry`) to narrate the client-rolled necrotic bonus on
  // an Unarmed Strike hit; Physician's Touch (L6+) adds the Poisoned rider.
  // Returns the updated character plus per-op { necroticDamage, poisoned, summary }.
  "hand-of-harm": defineAbility({
    schema: opBatch(dealHandOfHarmOpSchema),
    apply: (characterId, data) => applyHandOfHarmOperations(characterId, data.operations),
    domainErrors: [InvalidHandOfHarmOperationError, InvalidResourceOperationError],
    respond: (character, results) => ({ character, results }),
  }),

  // Spends 5 Focus + 1 use of the once-per-long-rest handOfUltimateMercy pool
  // to narrate reviving a creature with the client-rolled 4d10 + Wis mod hit
  // points. Returns the updated character plus per-op { hpRestored, summary }.
  "hand-of-ultimate-mercy": defineAbility({
    schema: opBatch(useHandOfUltimateMercyOpSchema),
    apply: (characterId, data) => applyHandOfUltimateMercyOperations(characterId, data.operations),
    domainErrors: [InvalidHandOfUltimateMercyOperationError, InvalidResourceOperationError],
    respond: (character, results) => ({ character, results }),
  }),

  // castManeuver — spend one superiority die (server rolls it), log the cast with
  // the announced DC, apply Rally temp HP. Returns the updated character plus
  // per-op { roll, saveDc } so the client folds the die into the attack/damage
  // total. The learn-a-maneuver catalog stays a GET on maneuversRouter.
  maneuvers: defineAbility({
    schema: opBatch(castManeuverOpSchema),
    apply: (characterId, data) => applyManeuverOperations(characterId, data.operations),
    domainErrors: [
      InvalidManeuverOperationError,
      InvalidResourceOperationError,
      InvalidSpellcastingOperationError,
    ],
    respond: (character, results) => ({ character, results }),
  }),

  // Imposes one Flurry-of-Blows rider (Addle/Push/Topple). Addle never rolls
  // (no save); Push/Topple roll a flat d20 vs the monk's focus save DC. Returns
  // the updated character plus per-op { rider, dc, roll?, outcome, summary }.
  "open-hand-technique": defineAbility({
    schema: opBatch(imposeOpenHandRiderOpSchema),
    apply: (characterId, data) => applyOpenHandTechniqueOperations(characterId, data.operations),
    domainErrors: [InvalidOpenHandTechniqueOperationError],
    respond: (character, results) => ({ character, results }),
  }),

  // setQuiveringPalm: spends 4 focus and marks vibrations active (lasts monk
  // level days, narrated). triggerQuiveringPalm: rolls a flat d20 Con save vs
  // the monk's focus save DC and halves the client-rolled 10d12 on a success,
  // clearing the active flag. Returns the updated character plus per-op result.
  "quivering-palm": defineAbility({
    schema: opBatch(setQuiveringPalmOpSchema, triggerQuiveringPalmOpSchema),
    apply: (characterId, data) => applyQuiveringPalmOperations(characterId, data.operations),
    domainErrors: [InvalidQuiveringPalmOperationError, InvalidResourceOperationError],
    respond: (character, results) => ({ character, results }),
  }),

  // Warrior of Shadow's two focus-fuelled features (#1246):
  //   castShadowArt          — spend 1 focus, cast Darkness (concentration).
  //   activateCloakOfShadows — spend 3 focus, self-apply invisible (L17).
  // The Shadow Arts picker stays a GET on shadowArtsRouter.
  "shadow-arts": defineAbility({
    schema: opBatch(castShadowArtOpSchema, activateCloakOfShadowsOpSchema),
    apply: (characterId, data) => applyShadowArtsOperations(characterId, data.operations),
    domainErrors: [InvalidShadowArtOperationError],
  }),

  // Rolls the rogue's level-derived Nd6 Sneak Attack server-side, enforcing the
  // once-per-turn + eligibility guard, and logs the roll. Returns the updated
  // character plus per-op { roll, dice, faces } so the client folds the roll into
  // the attack's damage tally.
  "sneak-attack": defineAbility({
    schema: opBatch(rollSneakAttackOpSchema),
    apply: (characterId, data) => applySneakAttackOperations(characterId, data.operations),
    domainErrors: [InvalidSneakAttackOperationError],
    respond: (character, results) => ({ character, results }),
  }),

  // Spends 1 focus and rolls the target's Constitution save (flat d20) against
  // the monk's focus save DC, enforcing the once-per-turn guard. Returns the
  // updated character plus per-op { dc, roll, outcome, summary } so the client
  // surfaces the fail(Stunned)/success(half-speed+advantage) rider inline.
  "stunning-strike": defineAbility({
    schema: opBatch(attemptStunningStrikeOpSchema),
    apply: (characterId, data) => applyStunningStrikeOperations(characterId, data.operations),
    domainErrors: [InvalidStunningStrikeOperationError, InvalidResourceOperationError],
    respond: (character, results) => ({ character, results }),
  }),

  // Warrior of the Elements (2024) session actions:
  //   castElementalBurst — spend 2 Focus, roll 3× Martial Arts die vs a Dex save
  //   elementalStrike    — while attuned, swap the strike's damage type and
  //                        force a Str save to move the target 10 ft
  // Elemental Attunement's own toggle (activate/end) moved OFF this endpoint
  // (#1686) — it's a plain executeAction "elementalAttunement"/
  // "endElementalAttunement" op on POST /actions/transactions now, row-driven
  // off monk.ts's AuthoredFeature entry.
  // Returns the updated character plus a per-op `results` array for the toast.
  "warrior-of-elements": defineAbility({
    schema: opBatch(
      z.object({
        type: z.literal("castElementalBurst"),
        damageType: elementalDamageTypeSchema,
        roll: z.number().positive(),
      }),
      z.object({
        type: z.literal("elementalStrike"),
        damageType: elementalDamageTypeSchema,
        roll: z.number().positive().optional(),
      }),
    ),
    apply: (characterId, data) => applyWarriorOfElementsOperations(characterId, data.operations),
    domainErrors: [InvalidWarriorOfElementsOperationError, InvalidResourceOperationError],
    respond: (character, results) => ({ character, results }),
  }),

  // Eldritch Knight Weapon Bond (2014, PHB'14 p.75, #1854): bondWeapon marks
  // an owned weapon InventoryItem row bonded (L3+ EK gate, 2-weapon cap, 409
  // on the 3rd); unbondWeapon is always legal. The "Summon bonded weapon"
  // bonus action itself is a plain DERIVED_ACTIONS row (actions.ts) — no
  // ability here casts or rolls anything.
  "weapon-bond": defineAbility({
    schema: opBatch(bondWeaponOpSchema, unbondWeaponOpSchema),
    apply: (characterId, data) => applyWeaponBondOperations(characterId, data.operations),
    domainErrors: [InvalidWeaponBondOperationError],
  }),
};
