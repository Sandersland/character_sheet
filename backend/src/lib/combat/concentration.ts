import { Prisma } from "@/generated/prisma/client.js";
import { clearBuffsForSourceInTx } from "./buff-end.js";
import { proficiencyBonusForLevel, levelForExperience } from "@/lib/leveling/experience.js";
import { logEvent } from "@/lib/activity/events.js";
import {
  abilityModifier,
  characterAdvancementSlots,
  concentrationSaveDC,
  deriveFeatProficiencies,
} from "@/lib/srd/srd.js";
import { rollDie } from "@/lib/core/dice.js";
// Imports resources-state's functions, not the resources module that composes applyHealInTx, to avoid an import cycle back into this file.
import { normalizeResourcesMutable, splitAdvancementsBySlotCap } from "@/lib/classes/resources-state.js";
import { normalizeSpellcastingMutable } from "@/lib/spellcasting/spell-state.js";

// Nullability is status/reason-dependent: held/roll/total/dc are all null while status is "pending";
// roll/saveBonus/total/dc are null on the reason "death" path (no save rolled).
export interface ConcentrationCheckResult {
  status: "resolved" | "pending";
  entryId: string;
  spellName: string;
  reason: "damage" | "death";
  held: boolean | null;
  roll: number | null;
  saveBonus: number | null;
  total: number | null;
  dc: number | null;
  damage: number;
}

// Shared by the auto path and the deferred manual-resolve path so the 5e math lives in exactly one place.
function computeConcentrationSave(
  row: {
    abilityScores: Prisma.JsonValue;
    experiencePoints: number;
    savingThrowProficiencies: string[];
    resources: Prisma.JsonValue;
    // Non-optional so a select omitting `class` fails tsc — this must resolve the same column as
    // reconcileAdvancements' clamp-on-read select (#1529).
    classEntries: { name: string; level: number; class: { extraAsiLevels: number[] } | null }[];
  },
  damage: number,
): { saveBonus: number; dc: number } {
  const abilityScores = row.abilityScores as Record<string, number>;
  const conMod = abilityModifier(abilityScores.constitution ?? 10);
  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  const advState = normalizeResourcesMutable(row.resources);
  const featSlotCap = characterAdvancementSlots(row.classEntries, level);
  // Origin feats are kept regardless of the slot cap (#1130).
  const { kept: inCapAdvancements } = splitAdvancementsBySlotCap(advState.advancements, featSlotCap);
  const featProf = deriveFeatProficiencies(inCapAdvancements);
  const proficientInCon =
    row.savingThrowProficiencies.includes("constitution") ||
    featProf.savingThrows.has("constitution");
  const saveBonus = conMod + (proficientInCon ? profBonus : 0);
  return { saveBonus, dc: concentrationSaveDC(damage) };
}

async function readConcentratingStateInTx(tx: Prisma.TransactionClient, characterId: string) {
  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      spellcasting: true,
      abilityScores: true,
      experiencePoints: true,
      savingThrowProficiencies: true,
      resources: true,
      // All entries: the feat-slot cap sums entitlement per class level (#1073), not just the primary entry.
      classEntries: {
        orderBy: { position: "asc" as const },
        select: { name: true, level: true, class: { select: { extraAsiLevels: true } } },
      },
    },
  });
  if (!row) return null;

  const state = normalizeSpellcastingMutable(row.spellcasting);
  const prior = state.concentratingOn;
  if (!prior) return null;
  return { row, state, prior };
}

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

// The 0-HP path takes precedence even when a save would also have been triggered.
// Deferred (#41 follow-up): concentration should also end when incapacitated/stunned/paralyzed/unconscious
// conditions are applied directly above 0 HP; only the 0-HP path is covered here.
// Logged under category "spellcasting" (not "hitPoints") so the revert handler restores the full
// spellcasting JSON; sharing the damage event's batchId means LIFO undo reverses both.
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
      return result;
    }
  }

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

// Only `roll` is client-trusted (validated 1..20 at the route); DC and save bonus are recomputed server-side.
// Unlike the auto path (shares the damage op's batchId), a manual save logs under its own fresh
// batchId and undoes as a separate LIFO entry.
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
