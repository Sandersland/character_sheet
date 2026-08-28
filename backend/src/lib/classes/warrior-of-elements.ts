// Warrior of the Elements (2024, PHB'24 p.90) — Elemental Burst plus the
// Elemental Strikes rider. Elemental Attunement's own activate/end toggle is
// row-driven, dispatched through the generic toggle handler; attunementActive()
// below still checks the shared "while-active" activeEffects buff registry
// (same key Rage uses) since Elemental Strike gates on it and Stride of the
// Elements/Elemental Epitome narrate off it.
//
// This app has no NPC combatant model: the Dex/Str save is a flat d20 (DC
// exact, roll is a simplification); Elemental Burst's damage is client-rolled
// and the server only resolves full vs half from its own save roll.

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { levelForExperience, proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { runCharacterTransaction, type CharacterTxContext } from "@/lib/character/character-transaction.js";
import { normalizeActiveEffectsMutable } from "@/lib/combat/active-effects.js";
import { applySpendResourceInTx } from "./resources.js";
import { actionGrantLevel, deriveEntryScopedActions } from "./actions.js";
import { FEATURE_ROWS_CLASS_FEATURES, FEATURE_ROWS_SUBCLASS_FEATURES, featureRowsOf } from "./feature-rows-select.js";
import { monkSaveDC } from "./ki-focus.js";
import { editionOf } from "@/lib/rules/edition.js";
import type {
  CastElementalBurstOperation,
  ElementalBurstResult,
  ElementalSaveOutcome,
  ElementalStrikeOperation,
  ElementalStrikeResult,
  WarriorOfElementsOperation,
  WarriorOfElementsResult,
} from "@character-sheet/shared-types";

export class InvalidWarriorOfElementsOperationError extends Error {}

export const ELEMENTAL_ATTUNEMENT_BUFF_KEY = "elementalAttunement";
const ELEMENTAL_BURST_FOCUS_COST = 2;

// PHB'24 p.90. Kept here because the route's z.enum consumes it; shared-types'
// union mirror is latched by resource-wire-contract.test.ts.
export const ELEMENTAL_DAMAGE_TYPES = ["acid", "cold", "fire", "lightning", "thunder"] as const;

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
  rulesEdition: true,
  // subclassRef.slug drives assertWarriorOfElements' subclass-identity gate;
  // class.features/subclassRef.features let that same gate see Elemental
  // Attunement's own row-driven action key too.
  classEntries: {
    orderBy: { position: "asc" as const },
    select: {
      name: true,
      level: true,
      subclass: true,
      subclassRef: { select: { slug: true, features: FEATURE_ROWS_SUBCLASS_FEATURES } },
      class: { select: { subclassLevel: true, features: FEATURE_ROWS_CLASS_FEATURES } },
    },
  },
} satisfies Prisma.CharacterSelect;

type WarriorOfElementsRow = Prisma.CharacterGetPayload<{ select: typeof WARRIOR_OF_ELEMENTS_SELECT }>;

function monkEntry(row: WarriorOfElementsRow) {
  return row.classEntries.find((c) => c.name.toLowerCase() === "monk");
}

/**
 * Throws unless `actionKey` is granted to this row's monk entry (via
 * deriveEntryScopedActions, the same gate availableActions[] uses); returns
 * the monk entry's own level. Passes pools:[] deliberately — only `.key`
 * presence is read here, never `.enabled`; the actual focus spend is
 * validated separately by applySpendResourceInTx.
 */
function assertWarriorOfElements(row: WarriorOfElementsRow, actionKey: string, feature: string): number {
  const monk = monkEntry(row);
  const totalLevel = levelForExperience(row.experiencePoints);
  const edition = editionOf(row);
  const granted = deriveEntryScopedActions(row.classEntries, totalLevel, [], true, edition, featureRowsOf).some((a) => a.key === actionKey);
  if (!monk || !granted) {
    // actionGrantLevel resolves the level from these rows, never a hardcoded duplicate of the gate.
    const rows = row.classEntries.flatMap((e) => {
      const carrier = featureRowsOf(e);
      return [...carrier.classRows, ...carrier.subclassRows];
    });
    throw new InvalidWarriorOfElementsOperationError(
      `Only a Warrior of the Elements monk (level ${actionGrantLevel(actionKey, edition, rows) ?? "?"}+) has ${feature}`,
    );
  }
  return monk.level;
}

function focusDcFor(row: WarriorOfElementsRow): number {
  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  return monkSaveDC(row.abilityScores as Record<string, number>, profBonus);
}

function attunementActive(row: WarriorOfElementsRow): boolean {
  return normalizeActiveEffectsMutable(row.activeEffects).buffs.some(
    (b) => b.key === ELEMENTAL_ATTUNEMENT_BUFF_KEY,
  );
}

async function castElementalBurst(
  tx: Prisma.TransactionClient,
  row: WarriorOfElementsRow,
  op: CastElementalBurstOperation,
  characterId: string,
  batchId: string,
  sessionId: string | null,
): Promise<ElementalBurstResult> {
  assertWarriorOfElements(row, "elementalBurst", "Elemental Burst");
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
  assertWarriorOfElements(row, "elementalAttunement", "Elemental Attunement");
  if (!attunementActive(row)) {
    throw new InvalidWarriorOfElementsOperationError(
      "Elemental Strikes require an active Elemental Attunement",
    );
  }

  // Free rider — no Focus cost. The move is narrated only (no NPC combatant model).
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
      if (op.type === "castElementalBurst") {
        results.push(await castElementalBurst(tx, row, op, id, batchId, sessionId));
      } else {
        results.push(await elementalStrike(tx, row, op, id, batchId, sessionId));
      }
    },
  });
  return results;
}
