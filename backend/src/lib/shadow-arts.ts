/**
 * Shadow Arts cast handler (Way of Shadow, #441) — the ki-cast counterpart to
 * lib/disciplines.ts. Each of the 4 L3 Shadow Arts spells is a GrantedAbility
 * row with source "shadowArts"; casting one spends a flat 2 ki via the shared
 * payAbilityCostInTx pool path and routes through castAbilityInTx (concentration
 * + buff application from the shared engine/#438).
 *
 * The 5e rules live here: the flat 2-ki cost (no ki scaling), which spells
 * require concentration, and the flat non-scaling EffectSpec build (buff for
 * Pass without Trace, utility otherwise). Availability + level gate come from
 * deriveResources() (class-features.ts).
 */

import { randomUUID } from "node:crypto";

import { Prisma } from "../generated/prisma/client.js";
import { castAbilityInTx } from "./ability-cast.js";
import { readAbilityCost, type PayCostContext } from "./ability-cost.js";
import { deriveResources } from "./class-features.js";
import type { EffectSpec } from "./effects.js";
import { logEvent } from "./events.js";
import { proficiencyBonusForLevel, levelForExperience } from "./experience.js";
import { prisma } from "./prisma.js";
import { getActiveSessionId } from "./sessions.js";
import { normalizeSpellcastingMutable, type SpellcastingMutableState } from "./spell-state.js";

// ── Error class ───────────────────────────────────────────────────────────────

export class InvalidShadowArtOperationError extends Error {}

// ── Operation types ───────────────────────────────────────────────────────────

/** Cast a Shadow Arts spell. `shadowArtId` is the catalog GrantedAbility.id. */
export interface CastShadowArtOperation {
  type: "castShadowArt";
  shadowArtId: string;
}

export type ShadowArtOperation = CastShadowArtOperation;

// ── 5e rules ──────────────────────────────────────────────────────────────────

// Prefix stamped on a Shadow Art's concentration entryId so its id space never overlaps a spellbook Spell.id.
export const SHADOW_ART_CONCENTRATION_PREFIX = "shadow-art:";

/** Shadow Arts spells that mimic a concentration spell — routed through the shared slot. */
const CONCENTRATION_SHADOW_ARTS = new Set<string>([
  "Shadow Arts: Darkness",
  "Shadow Arts: Silence",
  "Shadow Arts: Pass without Trace",
]);

// Catalog columns needed to build a Shadow Art's flat EffectSpec.
export interface ShadowArtEffectRow {
  name: string;
  effectKind?: string | null;
  buffTarget?: string | null;
  buffModifier?: number | null;
}

/**
 * Build a Shadow Art's EffectSpec directly: always flat (scaling.mode "none").
 * Pass without Trace is a buff (buffTarget/buffModifier map into the spec);
 * the rest are roll-less utility. Concentration is derived from the name set.
 */
export function shadowArtEffectSpec(row: ShadowArtEffectRow): EffectSpec {
  const isBuff = row.effectKind === "buff";
  return {
    effectType: isBuff ? "buff" : "utility",
    damageType: null,
    attackType: null,
    saveAbility: null,
    saveEffect: null,
    scaling: { mode: "none" },
    concentration: CONCENTRATION_SHADOW_ARTS.has(row.name),
    buffTarget: row.buffTarget ?? null,
    buffModifier: row.buffModifier ?? null,
  };
}

// Deep-copy the spellcasting state for a before/after event snapshot.
function snapshotSpellcasting(state: SpellcastingMutableState) {
  return {
    spellcasting: {
      slotsUsed: { ...state.slotsUsed },
      arcanumUsed: { ...state.arcanumUsed },
      spells: [...state.spells],
      concentratingOn: state.concentratingOn ? { ...state.concentratingOn } : null,
    },
  };
}

// ── Transaction handler ───────────────────────────────────────────────────────

/**
 * Applies a batch of Shadow Arts operations atomically. Mirrors
 * applyDisciplineOperations: one batchId, LIFO-undoable events, state re-read
 * per op. Per cast: the pool payer logs its own spendResource event (refunds ki
 * on revert); a concentration Shadow Art logs a spellcasting-category event
 * (restores concentratingOn on revert); the resources-category castShadowArt
 * event records the cast.
 */
export async function applyShadowArtsOperations(
  characterId: string,
  operations: ShadowArtOperation[],
): Promise<void> {
  const batchId = randomUUID();
  const sessionId = await getActiveSessionId(characterId);

  await prisma.$transaction(async (tx) => {
    for (const op of operations) {
      const row = await tx.character.findUnique({
        where: { id: characterId },
        select: {
          spellcasting: true,
          resources: true,
          experiencePoints: true,
          abilityScores: true,
          classEntries: {
            orderBy: { position: "asc" as const },
            take: 1,
            select: { name: true, subclass: true },
          },
        },
      });
      if (!row) {
        throw new InvalidShadowArtOperationError(`Character not found: ${characterId}`);
      }

      const level = levelForExperience(row.experiencePoints);
      const profBonus = proficiencyBonusForLevel(level);
      const primaryEntry = row.classEntries[0];
      const abilityScores = row.abilityScores as Record<string, number>;
      const derived = deriveResources(primaryEntry?.name ?? "", primaryEntry?.subclass ?? undefined, level, abilityScores, profBonus);

      // Gate: only a Way of Shadow monk of L3+ can cast Shadow Arts.
      if (!derived?.shadowArtsAvailable) {
        throw new InvalidShadowArtOperationError(
          "Only a Way of Shadow monk (level 3+) can cast Shadow Arts spells",
        );
      }

      const catalog = await tx.grantedAbility.findUnique({ where: { id: op.shadowArtId } });
      if (!catalog || catalog.source !== "shadowArts") {
        throw new InvalidShadowArtOperationError(`Shadow Art not found in catalog: ${op.shadowArtId}`);
      }

      const cost = readAbilityCost(catalog);
      if (cost.kind !== "pool") {
        throw new InvalidShadowArtOperationError(`${catalog.name} has no ki cost`);
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
          requested: cost.base, // flat 2 ki, no scaling
          roll: 0,
          eventType: "castShadowArt",
          concentrates,
        },
      );

      // Persist + audit the concentration change under the spellcasting category
      // so batch revert restores concentratingOn. Non-concentration Shadow Arts
      // (Darkvision) leave spellcasting alone.
      if (concentrates) {
        await tx.character.update({
          where: { id: characterId },
          data: {
            spellcasting: {
              slotsUsed: spellState.slotsUsed,
              arcanumUsed: spellState.arcanumUsed,
              spells: spellState.spells,
              concentratingOn: spellState.concentratingOn,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        await logEvent(tx, {
          characterId,
          category: "spellcasting",
          type: "castShadowArt",
          summary: `Concentrating on ${catalog.name}`,
          before: beforeSpell,
          after: snapshotSpellcasting(spellState),
          data: { shadowArtId: catalog.id, shadowArtName: catalog.name },
          batchId,
          sessionId,
        });
      }

      // The cast record itself restores nothing (ki refunded by the pool payer's
      // own spendResource event, concentration by the event above) — it just
      // records the cast.
      await logEvent(tx, {
        characterId,
        category: "resources",
        type: "castShadowArt",
        summary: outcome.summary,
        data: { shadowArtId: catalog.id, kiSpent: cost.base },
        batchId,
        sessionId,
      });
    }
  });
}
