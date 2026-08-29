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
import { applyStunningStrikeOperations, InvalidStunningStrikeOperationError } from "./stunning-strike.js";
import {
  applyWarriorOfElementsOperations,
  ELEMENTAL_DAMAGE_TYPES,
  InvalidWarriorOfElementsOperationError,
} from "./warrior-of-elements.js";
import { applyWeaponBondOperations, InvalidWeaponBondOperationError } from "./weapon-bond.js";

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
    domainErrors: [
      InvalidChannelDivinityOperationError,
      InvalidResourceOperationError,
      InvalidSpellcastingOperationError,
    ],
  }),

  "disciplines": defineAbility({
    schema: opBatch(castDisciplineOpSchema),
    apply: (characterId, data) => applyDisciplineOperations(characterId, data.operations),
    domainErrors: [InvalidDisciplineOperationError, InvalidResourceOperationError, InvalidSpellcastingOperationError],
  }),

  "hand-of-harm": defineAbility({
    schema: opBatch(dealHandOfHarmOpSchema),
    apply: (characterId, data) => applyHandOfHarmOperations(characterId, data.operations),
    domainErrors: [InvalidHandOfHarmOperationError, InvalidResourceOperationError],
    respond: (character, results) => ({ character, results }),
  }),

  "hand-of-ultimate-mercy": defineAbility({
    schema: opBatch(useHandOfUltimateMercyOpSchema),
    apply: (characterId, data) => applyHandOfUltimateMercyOperations(characterId, data.operations),
    domainErrors: [InvalidHandOfUltimateMercyOperationError, InvalidResourceOperationError],
    respond: (character, results) => ({ character, results }),
  }),

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

  "open-hand-technique": defineAbility({
    schema: opBatch(imposeOpenHandRiderOpSchema),
    apply: (characterId, data) => applyOpenHandTechniqueOperations(characterId, data.operations),
    domainErrors: [InvalidOpenHandTechniqueOperationError],
    respond: (character, results) => ({ character, results }),
  }),

  "quivering-palm": defineAbility({
    schema: opBatch(setQuiveringPalmOpSchema, triggerQuiveringPalmOpSchema),
    apply: (characterId, data) => applyQuiveringPalmOperations(characterId, data.operations),
    domainErrors: [InvalidQuiveringPalmOperationError, InvalidResourceOperationError],
    respond: (character, results) => ({ character, results }),
  }),

  "shadow-arts": defineAbility({
    schema: opBatch(castShadowArtOpSchema, activateCloakOfShadowsOpSchema),
    apply: (characterId, data) => applyShadowArtsOperations(characterId, data.operations),
    domainErrors: [InvalidShadowArtOperationError],
  }),

  "stunning-strike": defineAbility({
    schema: opBatch(attemptStunningStrikeOpSchema),
    apply: (characterId, data) => applyStunningStrikeOperations(characterId, data.operations),
    domainErrors: [InvalidStunningStrikeOperationError, InvalidResourceOperationError],
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
    domainErrors: [InvalidWarriorOfElementsOperationError, InvalidResourceOperationError],
    respond: (character, results) => ({ character, results }),
  }),

  // Eldritch Knight Weapon Bond, PHB'14 p.75.
  "weapon-bond": defineAbility({
    schema: opBatch(bondWeaponOpSchema, unbondWeaponOpSchema),
    apply: (characterId, data) => applyWeaponBondOperations(characterId, data.operations),
    domainErrors: [InvalidWeaponBondOperationError],
  }),
};
