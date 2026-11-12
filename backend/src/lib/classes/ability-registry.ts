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
  setQuiveringPalmOpSchema,
  triggerQuiveringPalmOpSchema,
  unbondWeaponOpSchema,
  useHandOfUltimateMercyOpSchema,
} from "@character-sheet/contracts";

import type { TransactionHandler } from "@/lib/character/transaction-handler.js";
import {
  applyChannelDivinityOperations,
} from "./channel-divinity.js";
import { applyDisciplineOperations } from "./disciplines.js";
import { applyHandOfHarmOperations } from "./hand-of-harm.js";
import {
  applyHandOfUltimateMercyOperations,
} from "./hand-of-ultimate-mercy.js";
import { applyManeuverOperations } from "./maneuvers.js";
import {
  applyOpenHandTechniqueOperations,
} from "./open-hand-technique.js";
import { applyQuiveringPalmOperations } from "./quivering-palm.js";
import { applyShadowArtsOperations } from "./shadow-arts.js";
import { applyStunningStrikeOperations } from "./stunning-strike.js";
import {
  applyWarriorOfElementsOperations,
  ELEMENTAL_DAMAGE_TYPES,
} from "./warrior-of-elements.js";
import { applyWeaponBondOperations } from "./weapon-bond.js";

const elementalDamageTypeSchema = z.enum(ELEMENTAL_DAMAGE_TYPES);

function opBatch<Options extends readonly [z.ZodObject, ...z.ZodObject[]]>(...options: Options) {
  return z.object({ operations: z.array(z.discriminatedUnion("type", options)).min(1) });
}

// No cast needed: TransactionHandler's apply/respond are checked bivariantly, so erasing each entry's <Schema, Result> pair here is sound.
function defineAbility<Schema extends z.ZodTypeAny, Result>(
  handler: TransactionHandler<Schema, Result>,
): TransactionHandler {
  return handler;
}

// Invariant: `abilityKey` is the basename of the ability's rules module in this directory.
export const ABILITY_REGISTRY: Record<string, TransactionHandler> = {
  "channel-divinity": defineAbility({
    schema: opBatch(castChannelDivinityOpSchema),
    apply: (characterId, data) => applyChannelDivinityOperations(characterId, data.operations),
  }),

  "disciplines": defineAbility({
    schema: opBatch(castDisciplineOpSchema),
    apply: (characterId, data) => applyDisciplineOperations(characterId, data.operations),
  }),

  "hand-of-harm": defineAbility({
    schema: opBatch(dealHandOfHarmOpSchema),
    apply: (characterId, data) => applyHandOfHarmOperations(characterId, data.operations),
    respond: (character, results) => ({ character, results }),
  }),

  "hand-of-ultimate-mercy": defineAbility({
    schema: opBatch(useHandOfUltimateMercyOpSchema),
    apply: (characterId, data) => applyHandOfUltimateMercyOperations(characterId, data.operations),
    respond: (character, results) => ({ character, results }),
  }),

  maneuvers: defineAbility({
    schema: opBatch(castManeuverOpSchema),
    apply: (characterId, data) => applyManeuverOperations(characterId, data.operations),
    respond: (character, results) => ({ character, results }),
  }),

  "open-hand-technique": defineAbility({
    schema: opBatch(imposeOpenHandRiderOpSchema),
    apply: (characterId, data) => applyOpenHandTechniqueOperations(characterId, data.operations),
    respond: (character, results) => ({ character, results }),
  }),

  "quivering-palm": defineAbility({
    schema: opBatch(setQuiveringPalmOpSchema, triggerQuiveringPalmOpSchema),
    apply: (characterId, data) => applyQuiveringPalmOperations(characterId, data.operations),
    respond: (character, results) => ({ character, results }),
  }),

  "shadow-arts": defineAbility({
    schema: opBatch(castShadowArtOpSchema, activateCloakOfShadowsOpSchema),
    apply: (characterId, data) => applyShadowArtsOperations(characterId, data.operations),
  }),

  "stunning-strike": defineAbility({
    schema: opBatch(attemptStunningStrikeOpSchema),
    apply: (characterId, data) => applyStunningStrikeOperations(characterId, data.operations),
    respond: (character, results) => ({ character, results }),
  }),

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
    respond: (character, results) => ({ character, results }),
  }),

  // Eldritch Knight Weapon Bond, PHB'14 p.75.
  "weapon-bond": defineAbility({
    schema: opBatch(bondWeaponOpSchema, unbondWeaponOpSchema),
    apply: (characterId, data) => applyWeaponBondOperations(characterId, data.operations),
  }),
};
