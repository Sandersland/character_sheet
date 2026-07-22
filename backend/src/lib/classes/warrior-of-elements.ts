// Warrior of the Elements (2024, PHB'24 p.90 / SRD 5.2) — the two Focus-spending
// session actions plus the Elemental Strikes rider, built as a dedicated vertical
// like quivering-palm.ts (a bespoke monk-subclass flow that bypasses the generic
// action catalog).
//
// Elemental Attunement is modeled as a "while-active" activeEffects buff (the
// same durable-buff registry Rage uses): activating it (no action, start of your
// turn) spends 1 Focus and rides the character for 10 minutes / until
// Incapacitated — narrated, since this app has no wall-clock combat timer (see
// quivering-palm.ts's day-count note). Stride of the Elements (L11) and Elemental
// Epitome (L17) read that active state; here it is the buff's presence.
//
// Roll ownership (mirrors Stunning Strike / Quivering Palm): the Dex/Str save is
// a flat d20 with no modifier — the DC is exact, the save roll is a deliberate
// simplification pending an NPC stat-block model. Elemental Burst's 3× Martial
// Arts die damage is the monk's OWN effect, so the client rolls it and sends the
// total; the server only decides full vs half from its own save roll.

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { levelForExperience, proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { runCharacterTransaction, type CharacterTxContext } from "@/lib/character/character-transaction.js";
import { appendActiveBuffInTx, clearBuffByKeyInTx, normalizeActiveEffectsMutable } from "@/lib/combat/active-effects.js";
import { applySpendResourceInTx } from "./resources.js";
import { focusSaveDC } from "./monk.js";

export class InvalidWarriorOfElementsOperationError extends Error {}

export const ELEMENTAL_ATTUNEMENT_BUFF_KEY = "elementalAttunement";
const ELEMENTAL_BURST_FOCUS_COST = 2;
const ELEMENTAL_ATTUNEMENT_FOCUS_COST = 1;

/** The five elemental damage types a Warrior of the Elements can deal (SRD 5.2). */
export const ELEMENTAL_DAMAGE_TYPES = ["acid", "cold", "fire", "lightning", "thunder"] as const;
export type ElementalDamageType = (typeof ELEMENTAL_DAMAGE_TYPES)[number];

/** Toggle Elemental Attunement on (spends 1 Focus) or off (no refund). */
export interface ToggleElementalAttunementOperation {
  type: "toggleElementalAttunement";
  active: boolean;
}

/** Elemental Burst (L6): Magic action, 2 Focus, 3× Martial Arts die, Dex save. */
export interface CastElementalBurstOperation {
  type: "castElementalBurst";
  damageType: ElementalDamageType;
  /** Client-rolled three-Martial-Arts-die total (server halves it on a made save). */
  roll: number;
}

/** Elemental Strikes rider (part of Elemental Attunement): swap the Unarmed
 *  Strike's damage type and force a Strength save to move the target 10 ft. */
export interface ElementalStrikeOperation {
  type: "elementalStrike";
  damageType: ElementalDamageType;
  /** Client-rolled Unarmed Strike damage of the chosen type (logged for the toast). */
  roll?: number;
}

export type WarriorOfElementsOperation =
  | ToggleElementalAttunementOperation
  | CastElementalBurstOperation
  | ElementalStrikeOperation;

export type ElementalSaveOutcome = "fail" | "success";

export interface ToggleAttunementResult {
  active: boolean;
  summary: string;
}

export interface ElementalBurstResult {
  dc: number;
  saveRoll: number;
  outcome: ElementalSaveOutcome;
  damageType: ElementalDamageType;
  rawDamage: number;
  appliedDamage: number;
  summary: string;
}

export interface ElementalStrikeResult {
  dc: number;
  saveRoll: number;
  outcome: ElementalSaveOutcome;
  damageType: ElementalDamageType;
  moved: boolean;
  summary: string;
}

export type WarriorOfElementsResult = ToggleAttunementResult | ElementalBurstResult | ElementalStrikeResult;

/** Fail (roll < DC) takes full damage; success halves it, rounded down (SRD 5.2 "half as much"). */
export function resolveElementalBurstDamage(
  saveRoll: number,
  dc: number,
  rawDamage: number,
): { outcome: ElementalSaveOutcome; appliedDamage: number } {
  const outcome: ElementalSaveOutcome = saveRoll >= dc ? "success" : "fail";
  return { outcome, appliedDamage: outcome === "success" ? Math.floor(rawDamage / 2) : rawDamage };
}

const WARRIOR_OF_ELEMENTS_SELECT = {
  experiencePoints: true,
  abilityScores: true,
  activeEffects: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { name: true, level: true, subclass: true },
  },
} satisfies Prisma.CharacterSelect;

type WarriorOfElementsRow = Prisma.CharacterGetPayload<{ select: typeof WARRIOR_OF_ELEMENTS_SELECT }>;

function monkEntry(row: WarriorOfElementsRow) {
  return row.classEntries.find((c) => c.name.toLowerCase() === "monk");
}

function isWarriorOfTheElements(row: WarriorOfElementsRow): boolean {
  return (monkEntry(row)?.subclass ?? "").toLowerCase().includes("elements");
}

/** Throws unless this is a Warrior of the Elements monk of at least `minLevel`; returns the monk level. */
function assertWarriorOfElements(row: WarriorOfElementsRow, minLevel: number, feature: string): number {
  const monk = monkEntry(row);
  if (!monk || monk.level < minLevel || !isWarriorOfTheElements(row)) {
    throw new InvalidWarriorOfElementsOperationError(
      `Only a Warrior of the Elements monk (level ${minLevel}+) has ${feature}`,
    );
  }
  return monk.level;
}

function focusDcFor(row: WarriorOfElementsRow): number {
  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  return focusSaveDC(row.abilityScores as Record<string, number>, profBonus);
}

function attunementActive(row: WarriorOfElementsRow): boolean {
  return normalizeActiveEffectsMutable(row.activeEffects).buffs.some(
    (b) => b.key === ELEMENTAL_ATTUNEMENT_BUFF_KEY,
  );
}

async function toggleElementalAttunement(
  tx: Prisma.TransactionClient,
  row: WarriorOfElementsRow,
  op: ToggleElementalAttunementOperation,
  characterId: string,
  batchId: string,
  sessionId: string | null,
): Promise<ToggleAttunementResult> {
  assertWarriorOfElements(row, 3, "Elemental Attunement");

  if (op.active) {
    if (attunementActive(row)) {
      throw new InvalidWarriorOfElementsOperationError("Elemental Attunement is already active");
    }
    // Start of your turn, no action: expend 1 Focus to imbue yourself for 10
    // minutes (or until Incapacitated) — modeled as a durable while-active buff.
    await applySpendResourceInTx(
      tx,
      characterId,
      { type: "spendResource", key: "focus", amount: ELEMENTAL_ATTUNEMENT_FOCUS_COST },
      batchId,
      sessionId,
    );
    await appendActiveBuffInTx(
      tx,
      characterId,
      {
        key: ELEMENTAL_ATTUNEMENT_BUFF_KEY,
        target: ELEMENTAL_ATTUNEMENT_BUFF_KEY,
        modifier: 0,
        source: "Elemental Attunement",
        duration: "while-active",
      },
      batchId,
      sessionId,
    );
    const summary = "Elemental Attunement — imbued with elemental energy for 10 minutes (or until Incapacitated).";
    await logEvent(tx, {
      characterId,
      category: "resources",
      type: "toggleElementalAttunement",
      summary,
      data: { active: true },
      batchId,
      sessionId,
    });
    return { active: true, summary };
  }

  if (!attunementActive(row)) {
    throw new InvalidWarriorOfElementsOperationError("Elemental Attunement is not active");
  }
  await clearBuffByKeyInTx(tx, characterId, ELEMENTAL_ATTUNEMENT_BUFF_KEY, batchId, sessionId, "Elemental Attunement ended");
  const summary = "Elemental Attunement ended.";
  await logEvent(tx, {
    characterId,
    category: "resources",
    type: "toggleElementalAttunement",
    summary,
    data: { active: false },
    batchId,
    sessionId,
  });
  return { active: false, summary };
}

async function castElementalBurst(
  tx: Prisma.TransactionClient,
  row: WarriorOfElementsRow,
  op: CastElementalBurstOperation,
  characterId: string,
  batchId: string,
  sessionId: string | null,
): Promise<ElementalBurstResult> {
  assertWarriorOfElements(row, 6, "Elemental Burst");
  if (!Number.isFinite(op.roll) || op.roll <= 0) {
    throw new InvalidWarriorOfElementsOperationError("castElementalBurst requires a positive damage roll");
  }

  await applySpendResourceInTx(
    tx,
    characterId,
    { type: "spendResource", key: "focus", amount: ELEMENTAL_BURST_FOCUS_COST },
    batchId,
    sessionId,
  );

  const dc = focusDcFor(row);
  const saveRoll = 1 + Math.floor(Math.random() * 20);
  const { outcome, appliedDamage } = resolveElementalBurstDamage(saveRoll, dc, op.roll);

  const summary =
    `Elemental Burst (${op.damageType}) — Dexterity save DC ${dc}, target rolled ${saveRoll}: ` +
    (outcome === "fail"
      ? `failed — ${appliedDamage} ${op.damageType} damage.`
      : `made it — ${appliedDamage} ${op.damageType} damage (half of ${op.roll}).`);

  await logEvent(tx, {
    characterId,
    category: "resources",
    type: "castElementalBurst",
    summary,
    data: { damageType: op.damageType, dc, saveRoll, outcome, rawDamage: op.roll, appliedDamage, focusSpent: ELEMENTAL_BURST_FOCUS_COST },
    batchId,
    sessionId,
  });

  return { dc, saveRoll, outcome, damageType: op.damageType, rawDamage: op.roll, appliedDamage, summary };
}

async function elementalStrike(
  tx: Prisma.TransactionClient,
  row: WarriorOfElementsRow,
  op: ElementalStrikeOperation,
  characterId: string,
  batchId: string,
  sessionId: string | null,
): Promise<ElementalStrikeResult> {
  assertWarriorOfElements(row, 3, "Elemental Attunement");
  if (!attunementActive(row)) {
    throw new InvalidWarriorOfElementsOperationError(
      "Elemental Strikes require an active Elemental Attunement",
    );
  }

  // The Unarmed Strike deals the chosen type instead of its normal type; on a hit
  // you may force a Strength save (focus DC) to move the target up to 10 ft. Free
  // rider — no Focus cost. The move itself is narrated (no NPC combatant model).
  const dc = focusDcFor(row);
  const saveRoll = 1 + Math.floor(Math.random() * 20);
  const outcome: ElementalSaveOutcome = saveRoll >= dc ? "success" : "fail";
  const moved = outcome === "fail";

  const dmg = op.roll && op.roll > 0 ? ` for ${op.roll} ${op.damageType} damage` : "";
  const summary =
    `Elemental Strike (${op.damageType})${dmg} — Strength save DC ${dc}, target rolled ${saveRoll}: ` +
    (moved ? "failed — moved up to 10 ft." : "made it — not moved.");

  await logEvent(tx, {
    characterId,
    category: "resources",
    type: "elementalStrike",
    summary,
    data: { damageType: op.damageType, dc, saveRoll, outcome, moved, rawDamage: op.roll ?? null },
    batchId,
    sessionId,
  });

  return { dc, saveRoll, outcome, damageType: op.damageType, moved, summary };
}

/**
 * Applies a batch of Warrior of the Elements operations atomically. Mirrors
 * applyQuiveringPalmOperations: one batchId, state re-read per op. Focus spends
 * (Attunement toggle-on, Elemental Burst) log their own undoable spendResource
 * event; the buff registry logs its own effects event.
 */
export async function applyWarriorOfElementsOperations(
  characterId: string,
  operations: WarriorOfElementsOperation[],
): Promise<WarriorOfElementsResult[]> {
  const results: WarriorOfElementsResult[] = [];
  await runCharacterTransaction<typeof WARRIOR_OF_ELEMENTS_SELECT, WarriorOfElementsOperation>(characterId, operations, {
    select: WARRIOR_OF_ELEMENTS_SELECT,
    notFound: (id) => new InvalidWarriorOfElementsOperationError(`Character not found: ${id}`),
    applyOp: async (ctx: CharacterTxContext<WarriorOfElementsRow, WarriorOfElementsOperation>) => {
      const { tx, row, op, characterId: id, batchId, sessionId } = ctx;
      if (op.type === "toggleElementalAttunement") {
        results.push(await toggleElementalAttunement(tx, row, op, id, batchId, sessionId));
      } else if (op.type === "castElementalBurst") {
        results.push(await castElementalBurst(tx, row, op, id, batchId, sessionId));
      } else {
        results.push(await elementalStrike(tx, row, op, id, batchId, sessionId));
      }
    },
  });
  return results;
}
