// Quivering Palm (Warrior of the Open Hand L17, SRD 5.2 / PHB'24 p.90) — a
// two-step feature: SET on an Unarmed Strike hit (spend 4 focus to place
// imperceptible vibrations lasting your monk level in days), then later, as a
// Magic action, TRIGGER them to force a Constitution save (focus DC) for
// 10d12 Force damage, half as much on a success.
//
// "Only one creature at a time" + the day-count duration aren't modeled as
// real state — this app has no NPC combatant or calendar/downtime tracker (see
// stunning-strike.ts's header for the same "no NPC combatant" call). The one
// piece that IS really persisted is the active/inactive flag, so it survives a
// reload or a new session: it reuses the activeEffects buff registry as an
// inert marker (modifier 0, target "quiveringPalm" — a key nothing else reads),
// exactly like Rage's "while-active" buff persists across a reload. The day
// countdown itself is narrated — the player/DM track elapsed days.
//
// Roll ownership (mirrors Stunning Strike): the Con save is a flat d20 with no
// modifier — DC is exact, the roll is a deliberate simplification pending an
// NPC stat-block model. The 10d12 damage is the monk's OWN supernatural
// effect, so — like Second Wind/Lay on Hands/Deflect Attacks' redirect — the
// client rolls it and sends the total; the server only decides full vs half
// from its own save roll.

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { levelForExperience, proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { runCharacterTransaction, type CharacterTxContext } from "@/lib/character/character-transaction.js";
import { appendActiveBuffInTx, clearBuffByKeyInTx, normalizeActiveEffectsMutable } from "@/lib/combat/active-effects.js";
import { applySpendResourceInTx } from "./resources.js";
import { focusSaveDC } from "./monk.js";

export class InvalidQuiveringPalmOperationError extends Error {}

export const QUIVERING_PALM_BUFF_KEY = "quiveringPalm";
const QUIVERING_PALM_FOCUS_COST = 4;

export interface SetQuiveringPalmOperation {
  type: "setQuiveringPalm";
}

export interface TriggerQuiveringPalmOperation {
  type: "triggerQuiveringPalm";
  /** Client-rolled 10d12 total (SRD 5.2: 10d12 Force, half on a successful save). */
  roll: number;
}

export type QuiveringPalmOperation = SetQuiveringPalmOperation | TriggerQuiveringPalmOperation;

export type QuiveringPalmSaveOutcome = "fail" | "success";

export interface SetQuiveringPalmResult {
  active: true;
  daysRemaining: number;
  summary: string;
}

export interface TriggerQuiveringPalmResult {
  dc: number;
  saveRoll: number;
  outcome: QuiveringPalmSaveOutcome;
  rawDamage: number;
  appliedDamage: number;
  summary: string;
}

export type QuiveringPalmResult = SetQuiveringPalmResult | TriggerQuiveringPalmResult;

/** Fail (roll < DC) takes full damage; success halves it, rounded down (SRD 5.2 "half as much"). */
export function resolveQuiveringPalmDamage(
  roll: number,
  dc: number,
  rawDamage: number,
): { outcome: QuiveringPalmSaveOutcome; appliedDamage: number } {
  const outcome: QuiveringPalmSaveOutcome = roll >= dc ? "success" : "fail";
  return { outcome, appliedDamage: outcome === "success" ? Math.floor(rawDamage / 2) : rawDamage };
}

const QUIVERING_PALM_SELECT = {
  experiencePoints: true,
  abilityScores: true,
  activeEffects: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { name: true, level: true, subclass: true },
  },
} satisfies Prisma.CharacterSelect;

type QuiveringPalmRow = Prisma.CharacterGetPayload<{ select: typeof QUIVERING_PALM_SELECT }>;

function monkEntry(row: QuiveringPalmRow) {
  return row.classEntries.find((c) => c.name.toLowerCase() === "monk");
}

function isWarriorOfTheOpenHand(row: QuiveringPalmRow): boolean {
  return (monkEntry(row)?.subclass ?? "").toLowerCase().includes("open hand");
}

/** Throws unless this is a level-17+ Warrior of the Open Hand; returns the monk level. */
function assertQuiveringPalmAvailable(row: QuiveringPalmRow): number {
  const monk = monkEntry(row);
  if (!monk || monk.level < 17 || !isWarriorOfTheOpenHand(row)) {
    throw new InvalidQuiveringPalmOperationError(
      "Only a Warrior of the Open Hand monk (level 17+) has Quivering Palm",
    );
  }
  return monk.level;
}

async function setQuiveringPalm(
  tx: Prisma.TransactionClient,
  row: QuiveringPalmRow,
  characterId: string,
  batchId: string,
  sessionId: string | null,
): Promise<SetQuiveringPalmResult> {
  const monkLevel = assertQuiveringPalmAvailable(row);

  const activeState = normalizeActiveEffectsMutable(row.activeEffects);
  if (activeState.buffs.some((b) => b.key === QUIVERING_PALM_BUFF_KEY)) {
    throw new InvalidQuiveringPalmOperationError("You can maintain vibrations in only one creature at a time");
  }

  await applySpendResourceInTx(
    tx,
    characterId,
    { type: "spendResource", key: "focus", amount: QUIVERING_PALM_FOCUS_COST },
    batchId,
    sessionId,
  );
  await appendActiveBuffInTx(
    tx,
    characterId,
    {
      key: QUIVERING_PALM_BUFF_KEY,
      target: QUIVERING_PALM_BUFF_KEY,
      modifier: 0,
      source: "Quivering Palm",
      duration: "while-active",
    },
    batchId,
    sessionId,
  );

  const summary = `Quivering Palm — set imperceptible vibrations (lasts ${monkLevel} days unless triggered or ended).`;
  await logEvent(tx, {
    characterId,
    category: "resources",
    type: "setQuiveringPalm",
    summary,
    data: { daysRemaining: monkLevel },
    batchId,
    sessionId,
  });

  return { active: true, daysRemaining: monkLevel, summary };
}

async function triggerQuiveringPalm(
  tx: Prisma.TransactionClient,
  row: QuiveringPalmRow,
  op: TriggerQuiveringPalmOperation,
  characterId: string,
  batchId: string,
  sessionId: string | null,
): Promise<TriggerQuiveringPalmResult> {
  assertQuiveringPalmAvailable(row);

  const activeState = normalizeActiveEffectsMutable(row.activeEffects);
  if (!activeState.buffs.some((b) => b.key === QUIVERING_PALM_BUFF_KEY)) {
    throw new InvalidQuiveringPalmOperationError("No vibrations are currently set");
  }
  if (!Number.isFinite(op.roll) || op.roll <= 0) {
    throw new InvalidQuiveringPalmOperationError("triggerQuiveringPalm requires a positive damage roll");
  }

  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  const abilityScores = row.abilityScores as Record<string, number>;
  const dc = focusSaveDC(abilityScores, profBonus);

  const saveRoll = 1 + Math.floor(Math.random() * 20);
  const { outcome, appliedDamage } = resolveQuiveringPalmDamage(saveRoll, dc, op.roll);

  await clearBuffByKeyInTx(tx, characterId, QUIVERING_PALM_BUFF_KEY, batchId, sessionId, "Quivering Palm triggered");

  const summary =
    `Quivering Palm — Constitution save DC ${dc}, target rolled ${saveRoll}: ` +
    (outcome === "fail"
      ? `failed — ${appliedDamage} Force damage.`
      : `made it — ${appliedDamage} Force damage (half of ${op.roll}).`);

  await logEvent(tx, {
    characterId,
    category: "resources",
    type: "triggerQuiveringPalm",
    summary,
    data: { dc, saveRoll, outcome, rawDamage: op.roll, appliedDamage },
    batchId,
    sessionId,
  });

  return { dc, saveRoll, outcome, rawDamage: op.roll, appliedDamage, summary };
}

/**
 * Applies a batch of Quivering Palm operations atomically. Mirrors
 * applyStunningStrikeOperations: one batchId, state re-read per op.
 */
export async function applyQuiveringPalmOperations(
  characterId: string,
  operations: QuiveringPalmOperation[],
): Promise<QuiveringPalmResult[]> {
  const results: QuiveringPalmResult[] = [];
  await runCharacterTransaction<typeof QUIVERING_PALM_SELECT, QuiveringPalmOperation>(characterId, operations, {
    select: QUIVERING_PALM_SELECT,
    notFound: (id) => new InvalidQuiveringPalmOperationError(`Character not found: ${id}`),
    applyOp: async (ctx: CharacterTxContext<QuiveringPalmRow, QuiveringPalmOperation>) => {
      const { tx, row, op, characterId: id, batchId, sessionId } = ctx;
      if (op.type === "setQuiveringPalm") {
        results.push(await setQuiveringPalm(tx, row, id, batchId, sessionId));
      } else {
        results.push(await triggerQuiveringPalm(tx, row, op, id, batchId, sessionId));
      }
    },
  });
  return results;
}
