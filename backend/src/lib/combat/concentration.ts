import { Prisma } from "@/generated/prisma/client.js";
import { clearBuffsForSourceInTx } from "./active-effects.js";
import { proficiencyBonusForLevel, levelForExperience } from "@/lib/leveling/experience.js";
import { logEvent } from "@/lib/activity/events.js";
import {
  abilityModifier,
  advancementSlotsForLevel,
  concentrationSaveDC,
  deriveFeatProficiencies,
} from "@/lib/srd/srd.js";
import { rollDie } from "@/lib/core/dice.js";
import { normalizeResourcesMutable } from "@/lib/classes/resources.js";
import { normalizeSpellcastingMutable } from "@/lib/spellcasting/spell-state.js";

// Concentration-on-damage (issue #41).

/**
 * Outcome of a concentration check triggered by a damage instance. Returned
 * (when non-null) so the route can surface the auto-rolled save to the player.
 * `held: false` with `reason: "death"` means concentration was dropped without
 * a save because the character hit 0 HP (or died).
 */
export interface ConcentrationCheckResult {
  /**
   * "resolved" — the save was rolled (or skipped via the death path); the
   * outcome in `held` is final. "pending" — a manual save is deferred to the
   * client (issue #76): `dc`/`saveBonus` are populated, `held`/`roll`/`total`
   * are null, and the client must follow up with a `concentrationSave` op.
   */
  status: "resolved" | "pending";
  /** The concentrating SpellEntry id — needed for the follow-up resolve op. */
  entryId: string;
  spellName: string;
  reason: "damage" | "death";
  /** null while pending (not yet rolled). */
  held: boolean | null;
  /** Present only for an actual save (reason "damage"); null on the 0-HP path or while pending. */
  roll: number | null;
  saveBonus: number | null;
  total: number | null;
  dc: number | null;
  damage: number;
}

/**
 * Compute the Constitution-save bonus and DC for a concentration check from a
 * character row and one damage instance. Save bonus = CON modifier + proficiency
 * bonus IF proficient in CON saves (class grant or feat grant). DC = max(10,
 * floor(damage / 2)). Shared by the auto path and the deferred manual-resolve
 * path so the 5e math lives in exactly one place.
 */
function computeConcentrationSave(
  row: {
    abilityScores: Prisma.JsonValue;
    experiencePoints: number;
    savingThrowProficiencies: string[];
    resources: Prisma.JsonValue;
    classEntries: { name: string }[];
  },
  damage: number,
): { saveBonus: number; dc: number } {
  const abilityScores = row.abilityScores as Record<string, number>;
  const conMod = abilityModifier(abilityScores.constitution ?? 10);
  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  const advState = normalizeResourcesMutable(row.resources);
  const featSlotCap = advancementSlotsForLevel(row.classEntries[0]?.name ?? "", level);
  const featProf = deriveFeatProficiencies(advState.advancements.slice(0, featSlotCap));
  const proficientInCon =
    row.savingThrowProficiencies.includes("constitution") ||
    featProf.savingThrows.has("constitution");
  const saveBonus = conMod + (proficientInCon ? profBonus : 0);
  return { saveBonus, dc: concentrationSaveDC(damage) };
}

// Re-read the character + concentration state inside the tx; null when the row
// is gone or the character is not concentrating.
async function readConcentratingStateInTx(tx: Prisma.TransactionClient, characterId: string) {
  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      spellcasting: true,
      abilityScores: true,
      experiencePoints: true,
      savingThrowProficiencies: true,
      resources: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        take: 1,
        select: { name: true },
      },
    },
  });
  if (!row) return null;

  const state = normalizeSpellcastingMutable(row.spellcasting);
  const prior = state.concentratingOn;
  if (!prior) return null;
  return { row, state, prior };
}

// Clear concentration and persist it; returns the after-snapshot for the event log.
async function dropConcentrationInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  state: ReturnType<typeof normalizeSpellcastingMutable>,
) {
  state.concentratingOn = null;
  await tx.character.update({
    where: { id: characterId },
    data: {
      spellcasting: {
        slotsUsed: state.slotsUsed,
        arcanumUsed: state.arcanumUsed,
        spells: state.spells,
        concentratingOn: null,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    slotsUsed: { ...state.slotsUsed },
    arcanumUsed: { ...state.arcanumUsed },
    spells: state.spells.map((s) => ({ ...s })),
    concentratingOn: null,
  };
}

/**
 * If the character is concentrating, resolve the 5e "concentration on damage"
 * rule for one instance of damage and, on a drop, clear `concentratingOn` and
 * log a `concentrationDropped` event.
 *
 * - At 0 HP (or already dead): concentration ends UNCONDITIONALLY, no save —
 *   reason "death". The 0-HP path wins if it also would have triggered a save.
 *   Runs regardless of `autoRoll`.
 * - Otherwise, when `autoRoll` is true: roll a Constitution saving throw
 *   server-side. DC = max(10, floor(damage / 2)). On a failed save (total < DC)
 *   concentration ends — reason "damage". On a success, nothing is logged.
 * - Otherwise, when `autoRoll` is false (issue #76): compute the DC + save bonus
 *   but DO NOT roll, mutate, or log. Return a `status: "pending"` result so the
 *   client can roll the save and follow up with a `concentrationSave` op.
 *
 * NOTE (deferred, issue #41 follow-up): concentration should ALSO end when the
 * incapacitated / stunned / paralyzed / unconscious CONDITIONS are applied. That
 * lives in the conditions feature (lib + conditions transaction path) and is
 * intentionally out of scope here. The 0-HP path below covers the common case
 * (dropping to 0 HP makes a character unconscious), but a directly-applied
 * condition with the character still above 0 HP will not yet drop concentration.
 *
 * The event is logged under category "spellcasting" (not "hitPoints") so the
 * activity revert handler restores the full spellcasting JSON from `before` —
 * sharing the batchId with the damage event means LIFO undo reverses both.
 *
 * Returns the check result for the route to surface, or null when the character
 * was not concentrating.
 */
export async function applyConcentrationCheckInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  damage: number,
  newCurrentHp: number,
  batchId: string,
  sessionId: string | null,
  autoRoll = true,
): Promise<ConcentrationCheckResult | null> {
  const concentration = await readConcentratingStateInTx(tx, characterId);
  if (!concentration) return null;
  const { row, state, prior } = concentration;

  const beforeSpellcasting = {
    slotsUsed: { ...state.slotsUsed },
    arcanumUsed: { ...state.arcanumUsed },
    spells: state.spells.map((s) => ({ ...s })),
    concentratingOn: { ...prior },
  };

  // Decide whether the save is even rolled.
  const droppedByDeath = newCurrentHp <= 0;
  let result: ConcentrationCheckResult;

  if (droppedByDeath) {
    result = {
      status: "resolved",
      entryId: prior.entryId,
      spellName: prior.spellName,
      reason: "death",
      held: false,
      roll: null,
      saveBonus: null,
      total: null,
      dc: null,
      damage,
    };
  } else {
    const { saveBonus, dc } = computeConcentrationSave(row, damage);

    if (!autoRoll) {
      // Manual path (issue #76): defer the roll to the client. Compute the DC
      // and bonus for the prompt, but leave concentration untouched — the
      // follow-up `concentrationSave` op resolves it.
      return {
        status: "pending",
        entryId: prior.entryId,
        spellName: prior.spellName,
        reason: "damage",
        held: null,
        roll: null,
        saveBonus,
        total: null,
        dc,
        damage,
      };
    }

    const roll = rollDie(20);
    const total = roll + saveBonus;
    const held = total >= dc;

    result = {
      status: "resolved",
      entryId: prior.entryId,
      spellName: prior.spellName,
      reason: "damage",
      held,
      roll,
      saveBonus,
      total,
      dc,
      damage,
    };

    if (held) {
      // Successful save — concentration holds, nothing to persist or log.
      return result;
    }
  }

  // Drop concentration (failed save, or 0-HP/death path).
  const afterSpellcasting = await dropConcentrationInTx(tx, characterId, state);

  const summary = droppedByDeath
    ? `Concentration on ${prior.spellName} dropped (dropped to 0 HP)`
    : `Concentration on ${prior.spellName} lost (CON save ${String(result.total)} vs DC ${String(result.dc)})`;

  await logEvent(tx, {
    characterId,
    category: "spellcasting",
    type: "concentrationDropped",
    summary,
    before: { spellcasting: beforeSpellcasting },
    after: { spellcasting: afterSpellcasting },
    data: {
      droppedEntryId: prior.entryId,
      droppedSpellName: prior.spellName,
      reason: result.reason,
      roll: result.roll,
      saveBonus: result.saveBonus,
      total: result.total,
      dc: result.dc,
      damage: result.damage,
      held: result.held,
    },
    batchId,
    sessionId,
  });

  // Ending concentration drops any buffs it was maintaining (#438).
  await clearBuffsForSourceInTx(tx, characterId, prior.entryId, batchId, sessionId, result.reason);

  return result;
}

/**
 * Resolve a deferred concentration CON save with a client-rolled d20 (issue #76),
 * the follow-up to a `damage` op that ran with `autoRollConcentration: false`.
 *
 * The DC is recomputed from `damage` and the save bonus from the live character —
 * the client's only trusted input is `roll` (validated 1..20 at the route). If the
 * character is no longer concentrating on `entryId` (already dropped, a second
 * damage resolved first, or a duplicate submit), this is a no-op and returns null.
 *
 * NOTE: unlike the auto path — which shares the damage op's batchId so a single
 * undo reverses HP + concentration together — a manual save arrives in its own
 * request, so this logs under a fresh batchId and is undone as a separate LIFO
 * entry. The spellcasting revert handler restores `concentratingOn` on undo.
 */
export async function applyConcentrationSaveInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  entryId: string,
  roll: number,
  damage: number,
  batchId: string,
  sessionId: string | null,
): Promise<ConcentrationCheckResult | null> {
  const concentration = await readConcentratingStateInTx(tx, characterId);
  if (!concentration) return null;
  const { row, state, prior } = concentration;
  // Stale no-op: concentrating on a different spell now.
  if (prior.entryId !== entryId) return null;

  const { saveBonus, dc } = computeConcentrationSave(row, damage);
  const total = roll + saveBonus;
  const held = total >= dc;

  const result: ConcentrationCheckResult = {
    status: "resolved",
    entryId: prior.entryId,
    spellName: prior.spellName,
    reason: "damage",
    held,
    roll,
    saveBonus,
    total,
    dc,
    damage,
  };

  if (held) {
    // Successful save — concentration holds, nothing to persist or log.
    return result;
  }

  const beforeSpellcasting = {
    slotsUsed: { ...state.slotsUsed },
    arcanumUsed: { ...state.arcanumUsed },
    spells: state.spells.map((s) => ({ ...s })),
    concentratingOn: { ...prior },
  };

  const afterSpellcasting = await dropConcentrationInTx(tx, characterId, state);

  await logEvent(tx, {
    characterId,
    category: "spellcasting",
    type: "concentrationDropped",
    summary: `Concentration on ${prior.spellName} lost (CON save ${String(total)} vs DC ${String(dc)})`,
    before: { spellcasting: beforeSpellcasting },
    after: { spellcasting: afterSpellcasting },
    data: {
      droppedEntryId: prior.entryId,
      droppedSpellName: prior.spellName,
      reason: "damage",
      roll,
      saveBonus,
      total,
      dc,
      damage,
      held,
    },
    batchId,
    sessionId,
  });

  // Ending concentration drops any buffs it was maintaining (#438).
  await clearBuffsForSourceInTx(tx, characterId, prior.entryId, batchId, sessionId, "damage");

  return result;
}
