/**
 * Battle Master maneuver cast handler — a focus/die-cast handler alongside
 * applyShadowArtsOperations. A maneuver is a superiority-die-fuelled activated ability
 * catalogued in GrantedAbility (source "maneuver"); casting one spends one die
 * via the shared payAbilityCostInTx pool path, rolls it server-side, and (for
 * Rally) applies self temp HP through the core's self-apply path.
 *
 * The 5e rules that live here: the die is always 1× the current superiority die
 * (no scaling), the announced save DC = 8 + prof + max(Str,Dex) (announcedSaveDC,
 * #1589), and Rally grants die + Cha mod as self temp HP. Placement/save columns
 * come from the catalog; the known list + die size come from resources + deriveResources.
 */

import type { CastManeuverOperation, ManeuverOperation } from "@character-sheet/contracts";

import { Prisma } from "@/generated/prisma/client.js";
import { castAbilityInTx } from "@/lib/spellcasting/ability-cast.js";
import { readAbilityCost, type PayCostContext } from "@/lib/spellcasting/ability-cost.js";
import { runCharacterTransaction, type CharacterTxContext } from "@/lib/character/character-transaction.js";
import { deriveEntryScopedResourcesForCharacterRow, resolveClassDie } from "./class-features.js";
import { FEATURE_ROWS_ENTRY_SELECT, featureRowsOf } from "./feature-rows-select.js";
import type { EffectSpec } from "@/lib/combat/effects.js";
import { logEvent } from "@/lib/activity/events.js";
import { normalizeResourcesMutable, type ManeuverEntry } from "./resources.js";
import { normalizeSpellcastingMutable } from "@/lib/spellcasting/spell-state.js";
import { abilityModifier } from "@/lib/srd/srd.js";

// "strength" → "Str", "dexterity" → "Dex", "wisdom" → "Wis", "constitution" → "Con".
function abbr(ability: string): string {
  return ability.slice(0, 3).replace(/^./, (c) => c.toUpperCase());
}

export class InvalidManeuverOperationError extends Error {}

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
// character-transaction contract). Every entry (not just the primary) + its
// level, so a non-primary Battle Master's save DC/pool still resolves via
// deriveEntryScopedResources (#1072).
const MANEUVER_SELECT = {
  spellcasting: true,
  resources: true,
  experiencePoints: true,
  abilityScores: true,
  rulesEdition: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { name: true, subclass: true, level: true, ...FEATURE_ROWS_ENTRY_SELECT },
  },
} satisfies Prisma.CharacterSelect;

type ManeuverRow = Prisma.CharacterGetPayload<{ select: typeof MANEUVER_SELECT }>;

// Gate: only a Battle Master fighter (L3+) has a superiority die + save DC.
// featureRowsOf (#1528 chunk 0) — Battle Master's superiority-dice pool and
// its announcedSaveDC are now BOTH row-driven (#1546 Part B: resourceKey/
// resourceTotals/resourceDieTiers + saveDcAbilities on the Combat Superiority
// row, read via deriveEntryScopedResourcesForCharacterRow -> registry.ts's
// deriveRowExtras), which is exactly why this carrier is threaded through
// here — not a forward-looking comment anymore, but the live path. The gate
// itself stays Battle-Master-specific in EFFECT (only that subclass's rows
// populate superiorityDice; #1589 generalised announcedSaveDC's MECHANISM to
// base-class rows too, but no base-class row populates saveDcAbilities in
// production today, so this entry's own announcedSaveDC still only ever
// comes from Combat Superiority) — only the thrown message's TEXT is
// deliberately class-agnostic (#1532's goal grep), so nobody reads a
// hardcoded class name here and "helpfully" restores it. Do not re-add the
// class name to the string below; the why is recorded here, not there.
function resolveSuperiority(row: ManeuverRow): { saveDcBase: number; dieFaces: number } {
  const { derived } = deriveEntryScopedResourcesForCharacterRow(row, featureRowsOf);

  const saveDcBase = derived?.announcedSaveDC;
  const dieFaces = derived ? resolveClassDie("superiorityDice", derived) : null;
  if (saveDcBase === undefined || dieFaces === null) {
    throw new InvalidManeuverOperationError(
      "No superiority dice or maneuver save DC available (level 3+ subclass feature required)",
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
  // Deliberately NOT guarded by crossEditionRejection (#1345): entry.maneuverId
  // is a PERSISTED id from an already-learned maneuver, not a client-supplied
  // one being admitted — the guard belongs at the write path that snapshotted
  // it (applyLearnManeuverOp, resources.ts), not here. Guarding this read
  // would brick an already-learned maneuver the moment its catalog row were
  // ever forked by edition, which is a false rejection on legitimate data,
  // worse than the hole #1345 closes.
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
 * applyShadowArtsOperations: one batchId, LIFO-undoable events, state re-read
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
