/**
 * Battle Master maneuver cast handler — the maneuver counterpart to
 * lib/disciplines.ts. A maneuver is a superiority-die-fuelled activated ability
 * catalogued in GrantedAbility (source "maneuver"); casting one spends one die
 * via the shared payAbilityCostInTx pool path, rolls it server-side, and (for
 * Rally) applies self temp HP through the core's self-apply path.
 *
 * The 5e rules that live here: the die is always 1× the current superiority die
 * (no scaling), the announced save DC = 8 + prof + max(Str,Dex) (maneuverSaveDC),
 * and Rally grants die + Cha mod as self temp HP. Placement/save columns come
 * from the catalog; the known list + die size come from resources + deriveResources.
 */

import { Prisma } from "@/generated/prisma/client.js";
import { castAbilityInTx } from "./ability-cast.js";
import { readAbilityCost, type PayCostContext } from "./ability-cost.js";
import { runCharacterTransaction, type CharacterTxContext } from "./character-transaction.js";
import { deriveResourcesForCharacterRow, resolveClassDie } from "./class-features.js";
import type { EffectSpec } from "./effects.js";
import { logEvent } from "./events.js";
import { normalizeResourcesMutable, type ManeuverEntry } from "./resources.js";
import { normalizeSpellcastingMutable } from "./spell-state.js";
import { abilityModifier } from "./srd.js";

// "strength" → "Str", "dexterity" → "Dex", "wisdom" → "Wis", "constitution" → "Con".
function abbr(ability: string): string {
  return ability.slice(0, 3).replace(/^./, (c) => c.toUpperCase());
}

export class InvalidManeuverOperationError extends Error {}

/** Cast a known maneuver: spend one superiority die (server rolls it). */
export interface CastManeuverOperation {
  type: "castManeuver";
  entryId: string; // per-character maneuversKnown entry id
}

export type ManeuverOperation = CastManeuverOperation;

/** Result surfaced to the route so the client can fold the die into a roll. */
export interface ManeuverCastResult {
  roll: number;
  saveDc: number | null;
  summary: string;
}

// A maneuver carries no independent roll — its EffectSpec is a bare utility so
// castAbilityInTx pays the die cost without an auto-summed damage/heal line.
function maneuverEffectSpec(saveAbility: string | null): EffectSpec {
  return {
    effectType: "utility",
    saveAbility,
    scaling: { mode: "none" },
  };
}

// Columns/relations re-read per op (5e-rules columns supplied here per the
// character-transaction contract).
const MANEUVER_SELECT = {
  spellcasting: true,
  resources: true,
  experiencePoints: true,
  abilityScores: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    take: 1,
    select: { name: true, subclass: true },
  },
} satisfies Prisma.CharacterSelect;

type ManeuverRow = Prisma.CharacterGetPayload<{ select: typeof MANEUVER_SELECT }>;

// Gate: only a Battle Master fighter (L3+) has a superiority die + save DC.
function resolveSuperiority(row: ManeuverRow): { saveDcBase: number; dieFaces: number } {
  const { derived } = deriveResourcesForCharacterRow(row);

  const saveDcBase = derived?.maneuverSaveDC;
  const dieFaces = derived ? resolveClassDie("superiorityDice", derived) : null;
  if (saveDcBase === undefined || dieFaces === null) {
    throw new InvalidManeuverOperationError(
      "Only a Battle Master fighter (level 3+) can spend maneuvers",
    );
  }
  return { saveDcBase, dieFaces };
}

// Resolve the known-maneuver entry + its catalog row (null for custom, die-only
// maneuvers). Throws if the entry isn't on the character's known list.
async function loadManeuver(tx: Prisma.TransactionClient, row: ManeuverRow, entryId: string) {
  const resources = normalizeResourcesMutable(row.resources);
  const entry = resources.maneuversKnown.find((m) => m.id === entryId);
  if (!entry) {
    throw new InvalidManeuverOperationError(`Maneuver not known: ${entryId}`);
  }
  const catalog = entry.maneuverId
    ? await tx.grantedAbility.findUnique({ where: { id: entry.maneuverId } })
    : null;
  return { entry, catalog };
}

function buildManeuverSummary(
  entry: ManeuverEntry,
  dieLabel: string,
  roll: number,
  saveDc: number | null,
  saveAbility: string | null,
  selfTempHp: boolean,
  tempHp: number,
): string {
  let summary = `Used ${entry.name} — ${dieLabel}:${roll}`;
  if (saveDc !== null && saveAbility) summary += `, DC ${saveDc} ${abbr(saveAbility)} save`;
  if (selfTempHp) summary += ` (${tempHp} temp HP)`;
  return summary;
}

interface ManeuverCastArgs {
  entry: ManeuverEntry;
  cost: ReturnType<typeof readAbilityCost>;
  saveAbility: string | null;
  roll: number;
  selfTempHp: boolean;
  tempHp: number;
  spellState: ReturnType<typeof normalizeSpellcastingMutable>;
}

// Spend the die via the shared cost path — pays the pool and (Rally) self-applies
// temp HP. The pool payer logs its own spendResource event for revert.
async function spendManeuverDie(
  ctx: CharacterTxContext<ManeuverRow, CastManeuverOperation>,
  { entry, cost, saveAbility, roll, selfTempHp, tempHp, spellState }: ManeuverCastArgs,
): Promise<void> {
  const { tx, characterId, batchId, sessionId } = ctx;
  const costCtx: PayCostContext = { tx, characterId, batchId, sessionId };
  await castAbilityInTx(
    { tx, characterId, batchId, sessionId, cost: costCtx, concentrationHost: spellState },
    {
      name: entry.name,
      entryId: entry.id,
      cost,
      effect: maneuverEffectSpec(saveAbility),
      requested: cost.kind === "pool" ? 1 : undefined,
      roll,
      eventType: "castManeuver",
      concentrates: false,
      apply: selfTempHp && tempHp > 0 ? { target: "self", kind: "tempHp", amount: tempHp } : undefined,
    },
  );
}

// The resources-category cast record carrying the roll + announced DC.
async function logManeuverCast(
  ctx: CharacterTxContext<ManeuverRow, CastManeuverOperation>,
  args: { entry: ManeuverEntry; roll: number; dieLabel: string; saveDc: number | null; saveAbility: string | null; summary: string },
): Promise<void> {
  const { tx, characterId, batchId, sessionId } = ctx;
  const { entry, roll, dieLabel, saveDc, saveAbility, summary } = args;
  await logEvent(tx, {
    characterId,
    category: "resources",
    type: "castManeuver",
    summary,
    data: {
      entryId: entry.id,
      maneuverId: entry.maneuverId ?? null,
      maneuverName: entry.name,
      roll,
      die: dieLabel,
      saveDc,
      saveAbility,
    },
    batchId,
    sessionId,
  });
}

// Casts one known maneuver: spends one superiority die (server rolls it) and
// logs the resources-category castManeuver event. See applyManeuverOperations.
async function castManeuver(
  ctx: CharacterTxContext<ManeuverRow, CastManeuverOperation>,
): Promise<ManeuverCastResult> {
  const { tx, row, op } = ctx;

  const { saveDcBase, dieFaces } = resolveSuperiority(row);
  const { entry, catalog } = await loadManeuver(tx, row, op.entryId);
  const saveAbility = catalog?.saveAbility ?? null;
  const selfTempHp = catalog?.selfTempHp ?? false;

  // Server owns the roll: 1× the current superiority die.
  const roll = 1 + Math.floor(Math.random() * dieFaces);
  const dieLabel = `d${dieFaces}`;
  const cost = readAbilityCost(catalog ?? { costKind: "pool", costPoolKey: "superiorityDice", costBase: 1 });

  // Rally: die + Cha mod as self temp HP via the core self-apply path.
  const abilityScores = row.abilityScores as Record<string, number>;
  const chaMod = abilityModifier(abilityScores.charisma ?? 10);
  const tempHp = selfTempHp ? Math.max(0, roll + chaMod) : 0;

  const spellState = normalizeSpellcastingMutable(row.spellcasting);
  await spendManeuverDie(ctx, { entry, cost, saveAbility, roll, selfTempHp, tempHp, spellState });

  const saveDc = saveAbility ? saveDcBase : null;
  const summary = buildManeuverSummary(entry, dieLabel, roll, saveDc, saveAbility, selfTempHp, tempHp);
  await logManeuverCast(ctx, { entry, roll, dieLabel, saveDc, saveAbility, summary });

  return { roll, saveDc, summary };
}

/**
 * Applies a batch of maneuver operations atomically. Mirrors
 * applyDisciplineOperations: one batchId, LIFO-undoable events, state re-read
 * per op. Each cast: the pool payer logs its own spendResource event (refunds
 * the die on revert); the resources-category castManeuver event carries the
 * roll + announced DC. Returns one ManeuverCastResult per op (client folds the
 * die into the relevant attack/damage total per the maneuver's placement).
 */
export async function applyManeuverOperations(
  characterId: string,
  operations: ManeuverOperation[],
): Promise<ManeuverCastResult[]> {
  const results: ManeuverCastResult[] = [];
  await runCharacterTransaction<typeof MANEUVER_SELECT, ManeuverOperation>(characterId, operations, {
    select: MANEUVER_SELECT,
    notFound: (id) => new InvalidManeuverOperationError(`Character not found: ${id}`),
    applyOp: async (ctx) => {
      results.push(await castManeuver(ctx));
    },
  });
  return results;
}
