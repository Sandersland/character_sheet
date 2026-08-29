// castShadowArt: 2024 (PHB'24 p.91) — one cast, 1 focus, Darkness, always concentrates. 2014 (PHB'14 pp.79-80, not in SRD 5.1) — a 4-spell 2-ki menu (Darkness/Darkvision/Pass without Trace/Silence); only Darkvision doesn't concentrate. Every field (cost, concentration) comes from the catalog row, so this function needs no edition branch of its own.
// activateCloakOfShadows: no catalog row (a single fixed feature) — cost/effect are hardcoded and edition-branched: 2014 L11 (action only, no ki cost, ends on attack/cast/bright light); 2024 L17 (3 focus, 1 minute, frees Flurry of Blows while it lasts).
// Both level gates live as ClassFeature rows — this file never hardcodes a level, only reads whether the entry-scoped action key is present.

import type { CastShadowArtOperation, ShadowArtOperation } from "@character-sheet/contracts";

import { castAbilityInTx } from "@/lib/spellcasting/ability-cast.js";
import { readAbilityCost, type AbilityCost, type PayCostContext } from "@/lib/spellcasting/ability-cost.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { levelForExperience } from "@/lib/leveling/experience.js";
import { editionOf } from "@/lib/rules/edition.js";
import { crossEditionRejection } from "@/lib/rules/catalog-edition.js";
import type { RulesEdition } from "@character-sheet/shared-types";
import { deriveEntryScopedActions } from "./actions.js";
import { featureRowsOf } from "./feature-rows-select.js";
import { catalogEffectSpec, type EffectSpec } from "@/lib/combat/effects.js";
import { normalizeSpellcastingMutable, snapshotSpellcasting } from "@/lib/spellcasting/spell-state.js";
import { applyConditionInTx } from "@/lib/combat/conditions.js";
import { logEvent } from "@/lib/activity/events.js";
import { FOCUS_CAST_CHARACTER_SELECT, emitFocusCastEvents } from "./focus-cast.js";
import type { Prisma } from "@/generated/prisma/client.js";

export class InvalidShadowArtOperationError extends Error {}

// Prefix stamped on a Shadow Art's concentration entryId so its id space never overlaps a spellbook Spell.id.
export const SHADOW_ART_CONCENTRATION_PREFIX = "shadow-art:";

// Cloak of Shadows carries no GrantedAbility catalog row (a single fixed feature, not a "choose one" menu like Shadow Arts) — its cost/effect/entryId are fixed constants rather than read from the DB.
// 2014's cost uses AbilityCost's {kind:"none"} variant, not a fake 0-base pool spend — payAbilityCostInTx's case "none" short-circuit (no applySpendResourceInTx call) does the right thing for free.
const CLOAK_OF_SHADOWS_NAME = "Cloak of Shadows";
const CLOAK_OF_SHADOWS_ENTRY_ID = "cloak-of-shadows";
// Narrowed to the "pool" variant so `.base` is accessible below without a runtime kind check — this constant is always a pool cost.
const CLOAK_OF_SHADOWS_2024_COST: Extract<AbilityCost, { kind: "pool" }> = { kind: "pool", key: "focus", base: 3 };
const CLOAK_OF_SHADOWS_2014_COST: Extract<AbilityCost, { kind: "none" }> = { kind: "none" };
const CLOAK_OF_SHADOWS_EFFECT: EffectSpec = {
  effectType: "utility",
  damageType: null,
  attackType: null,
  saveAbility: null,
  saveEffect: null,
  scaling: { mode: "none" },
  concentration: false,
};

export interface ShadowArtEffectRow {
  name: string;
  effectKind?: string | null;
  buffTarget?: string | null;
  buffModifier?: number | null;
}

// Darkvision is the one 2014 Shadow Art that does NOT concentrate (PHB'14: "Duration: 8 hours", no Concentration prefix) — name-keyed rather than edition-keyed since it's the only exempt name in the whole catalog.
const SHADOW_ARTS_NO_CONCENTRATION = new Set(["Shadow Arts: Darkvision"]);

export function shadowArtEffectSpec(row: ShadowArtEffectRow): EffectSpec {
  return catalogEffectSpec(row, {
    scaling: { mode: "none" },
    concentrates: (name) => !SHADOW_ARTS_NO_CONCENTRATION.has(name),
  });
}

async function applyCastShadowArt(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: CastShadowArtOperation,
  batchId: string,
  sessionId: string | null,
  row: { spellcasting: Prisma.JsonValue; rulesEdition: RulesEdition },
): Promise<void> {
  const catalog = await tx.grantedAbility.findUnique({ where: { id: op.shadowArtId } });
  if (!catalog || catalog.source !== "shadowArts") {
    throw new InvalidShadowArtOperationError(`Shadow Art not found in catalog: ${op.shadowArtId}`);
  }

  // Transient cast, not a permanent snapshot — still a wrong-edition rule applied to one cast and recorded in the audit event.
  const mismatch = crossEditionRejection(catalog, `Shadow Art "${catalog.name}"`, editionOf(row));
  if (mismatch) throw new InvalidShadowArtOperationError(mismatch);

  const cost = readAbilityCost(catalog);
  if (cost.kind !== "pool") {
    throw new InvalidShadowArtOperationError(`${catalog.name} has no focus cost`);
  }

  const effect = shadowArtEffectSpec(catalog);
  const concentrates = effect.concentration ?? false;

  const spellState = normalizeSpellcastingMutable(row.spellcasting);
  const beforeSpell = snapshotSpellcasting(spellState);

  const costCtx: PayCostContext = { tx, characterId, batchId, sessionId };
  const outcome = await castAbilityInTx(
    { tx, characterId, batchId, sessionId, cost: costCtx, concentrationHost: spellState },
    {
      name: catalog.name,
      entryId: `${SHADOW_ART_CONCENTRATION_PREFIX}${catalog.id}`,
      cost,
      effect,
      requested: cost.base, // flat 1 focus, no scaling
      roll: 0,
      eventType: "castShadowArt",
      concentrates,
    },
  );

  // Concentration reverts via the spellcasting event's own restore of concentratingOn; focus/ki reverts via the pool payer's spendResource event.
  // The spend field name is keyed off cost.key ("ki" or "focus"), not hardcoded — a 2014 Way of Shadow cast spends ki, and a hardcoded focusSpent would mislabel it in CharacterEvent.data.
  await emitFocusCastEvents(tx, {
    characterId,
    batchId,
    sessionId,
    eventType: "castShadowArt",
    concentrates,
    spellState,
    beforeSpell,
    concentrationName: catalog.name,
    concentrationData: { shadowArtId: catalog.id, shadowArtName: catalog.name },
    resourceSummary: outcome.summary,
    resourceData: { shadowArtId: catalog.id, [`${cost.key}Spent`]: cost.base },
  });
}

// No concentration (ends manually on attack/cast/bright light) — skips emitFocusCastEvents' concentration branch and instead mirrors applyChannelDivinityOperations' invisible-kind tail.
async function applyActivateCloakOfShadows(
  tx: Prisma.TransactionClient,
  characterId: string,
  batchId: string,
  sessionId: string | null,
  row: { spellcasting: Prisma.JsonValue; rulesEdition: RulesEdition },
): Promise<void> {
  const cost = editionOf(row) === "EDITION_2014" ? CLOAK_OF_SHADOWS_2014_COST : CLOAK_OF_SHADOWS_2024_COST;
  const spellState = normalizeSpellcastingMutable(row.spellcasting);
  const costCtx: PayCostContext = { tx, characterId, batchId, sessionId };
  const outcome = await castAbilityInTx(
    { tx, characterId, batchId, sessionId, cost: costCtx, concentrationHost: spellState },
    {
      name: CLOAK_OF_SHADOWS_NAME,
      entryId: CLOAK_OF_SHADOWS_ENTRY_ID,
      cost,
      effect: CLOAK_OF_SHADOWS_EFFECT,
      requested: cost.kind === "pool" ? cost.base : undefined,
      roll: 0,
      eventType: "castShadowArt",
      concentrates: false,
    },
  );

  await applyConditionInTx(tx, characterId, "invisible", CLOAK_OF_SHADOWS_NAME, batchId, sessionId);

  await logEvent(tx, {
    characterId,
    category: "resources",
    type: "castShadowArt",
    summary: outcome.summary,
    data: { focusSpent: cost.kind === "pool" ? cost.base : 0 },
    batchId,
    sessionId,
  });
}

// Mirrors applyManeuverOperations: one batchId, LIFO-undoable events, state re-read per op.
export async function applyShadowArtsOperations(
  characterId: string,
  operations: ShadowArtOperation[],
): Promise<void> {
  await runCharacterTransaction(characterId, operations, {
    select: FOCUS_CAST_CHARACTER_SELECT,
    notFound: (id) => new InvalidShadowArtOperationError(`Character not found: ${id}`),
    applyOp: async ({ tx, row, op, batchId, sessionId }) => {
      // Entry-scoped (keys off the MONK entry's own level, so a secondary Warrior of Shadow monk gates correctly) — resolved through the SAME deriveEntryScopedActions the wire's availableActions[] uses, never a second copy of the level gate.
      // Passes pools:[] deliberately: this only reads `.key` presence, never `.enabled` — real focus sufficiency is enforced by castAbilityInTx below. A future `.some(a => a.key === X && a.enabled)` check would wrongly reject every cast since pools:[] always yields enabled:false; pass the real pools if that's ever needed.
      const level = levelForExperience(row.experiencePoints);
      const edition = editionOf(row);
      const actions = deriveEntryScopedActions(row.classEntries, level, [], true, edition, featureRowsOf);
      // 2014's Way of Shadow gates Cloak of Shadows at L11 (PHB'14 p.80), 2024's Warrior of Shadow at L17 (PHB'24 p.91); Shadow Arts gates at L3 in both.
      const subclassLabel = edition === "EDITION_2014" ? "Way of Shadow" : "Warrior of Shadow";

      if (op.type === "activateCloakOfShadows") {
        if (!actions.some((a) => a.key === "cloakOfShadows")) {
          const gateLevel = edition === "EDITION_2014" ? 11 : 17;
          throw new InvalidShadowArtOperationError(
            `Only a ${subclassLabel} monk (level ${gateLevel}+) can use Cloak of Shadows`,
          );
        }
        await applyActivateCloakOfShadows(tx, characterId, batchId, sessionId, row);
        return;
      }

      if (!actions.some((a) => a.key === "shadowArts")) {
        throw new InvalidShadowArtOperationError(
          `Only a ${subclassLabel} monk (level 3+) can cast Shadow Arts spells`,
        );
      }
      await applyCastShadowArt(tx, characterId, op, batchId, sessionId, row);
    },
  });
}
