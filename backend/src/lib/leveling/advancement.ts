/**
 * Advancement transaction handler — Ability Score Improvements and Feats.
 *
 * What is persisted: `advancements` array inside Character.resources JSON,
 * plus the side-effected columns `abilityScores`, `hitPoints`, and
 * `initiativeBonus` (which are updated atomically in the same transaction).
 *
 * What is derived at read time: the total slot count (advancementSlotsForLevel
 * in srd/srd.ts) and the clamped display values in serializeCharacter.
 *
 * Design notes:
 *   - Each AdvancementEntry records the exact deltas applied so reversal
 *     subtracts the stored values rather than recomputing from ability scores,
 *     which may have changed since (LIFO undo / reconcile are exact).
 *   - CON increase: +1 max HP per character level applied (hitDice.total).
 *   - DEX increase: initiativeBonus updates by the net change in DEX modifier.
 *   - Undo rides the new `advancement` category in activity.ts, which
 *     restores abilityScores, hitPoints, initiativeBonus, and resources.
 */

import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { levelForExperience, proficiencyBonusForLevel } from "./experience.js";
import { logEvent } from "@/lib/activity/events.js";
import {
  snapshotResources,
  normalizeResourcesMutable,
  serializeResourcesState,
  type AdvancementEntry,
  type FeatImprovement,
  type ResourcesMutableState,
} from "@/lib/classes/resources.js";
import { advancementSlotsForLevel, abilityModifier } from "@/lib/srd/srd.js";
import { normalizeHitPoints, normalizeHitDice, type HitPoints, type HitDice } from "@/lib/combat/hitpoints.js";

export class InvalidAdvancementOperationError extends Error {}

const ABILITY_NAMES = new Set([
  "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma",
]);

const ABILITY_CAP = 20;

/**
 * Computes the effect of applying `abilityDeltas` to `scores`.
 * Returns the new scores and the delta amounts to add to hitPoints.max/current
 * and initiativeBonus. All side-effects on persisted columns derive from here.
 */
function computeAdvancementEffect(
  scores: Record<string, number>,
  hitDiceTotal: number,
  abilityDeltas: Record<string, number>,
): { newScores: Record<string, number>; hpDelta: number; initDelta: number } {
  const newScores = { ...scores };
  for (const [ability, delta] of Object.entries(abilityDeltas)) {
    newScores[ability] = (newScores[ability] ?? 10) + delta;
  }

  // CON: each +1 to CON modifier adds +1 HP per level applied.
  const oldConMod = abilityModifier(scores.constitution ?? 10);
  const newConMod = abilityModifier(newScores.constitution ?? 10);
  const hpDelta = (newConMod - oldConMod) * hitDiceTotal;

  // DEX: each +1 to DEX modifier adds +1 to initiative.
  const oldDexMod = abilityModifier(scores.dexterity ?? 10);
  const newDexMod = abilityModifier(newScores.dexterity ?? 10);
  const initDelta = newDexMod - oldDexMod;

  return { newScores, hpDelta, initDelta };
}

/**
 * Reverses a list of AdvancementEntry values against the current column values,
 * subtracting each entry's stored deltas in LIFO order. Returns the restored
 * column values (does not write anything).
 */
export function reverseAdvancementEffects(
  scores: Record<string, number>,
  hitPoints: { current: number; max: number; temp: number; deathSaves: { successes: number; failures: number } },
  initiativeBonus: number,
  entriesToReverse: AdvancementEntry[],
): {
  scores: Record<string, number>;
  hitPoints: { current: number; max: number; temp: number; deathSaves: { successes: number; failures: number } };
  initiativeBonus: number;
} {
  const newScores = { ...scores };
  let newHp = { ...hitPoints, deathSaves: { ...hitPoints.deathSaves } };
  let newInit = initiativeBonus;

  // Apply in reverse order (LIFO).
  for (const entry of [...entriesToReverse].reverse()) {
    for (const [ability, delta] of Object.entries(entry.abilityDeltas)) {
      newScores[ability] = (newScores[ability] ?? 10) - delta;
    }
    newHp = {
      ...newHp,
      max: newHp.max - entry.hpDelta,
      current: Math.min(newHp.current, newHp.max - entry.hpDelta),
    };
    newInit = newInit - entry.initDelta;
  }

  return { scores: newScores, hitPoints: newHp, initiativeBonus: newInit };
}

export interface TakeAsiOperation {
  type: "takeAsi";
  /** One or two increases summing to exactly 2, each capped at 1 or 2. */
  increases: { ability: string; amount: 1 | 2 }[];
}

export interface TakeFeatOperation {
  type: "takeFeat";
  /** Catalog Feat.id — omit for custom feats. */
  featId?: string;
  /** Custom feat payload when featId is absent. */
  custom?: {
    name: string;
    description: string;
    improvements?: FeatImprovement[];
    /**
     * Half-feat style: list of ability names the player may choose to bump.
     * When provided (non-empty), `abilityChoice` must be set at the operation level.
     */
    abilityOptions?: string[];
    /** Amount to increase the chosen ability (default 1). */
    abilityIncrease?: number;
  };
  /** Required when taking a half-feat (catalog or custom) with abilityOptions. */
  abilityChoice?: string;
}

export interface RemoveAdvancementOperation {
  type: "removeAdvancement";
  /** Per-character entry UUID (AdvancementEntry.id). */
  entryId: string;
}

export type AdvancementOperation =
  | TakeAsiOperation
  | TakeFeatOperation
  | RemoveAdvancementOperation;

/** Normalized per-op inputs handed to each advancement op handler. */
interface AdvancementOpContext {
  tx: Prisma.TransactionClient;
  scores: Record<string, number>;
  hp: HitPoints;
  hitDice: HitDice;
  initBonus: number;
  /** Mutable — handlers push/splice `state.advancements` in place. */
  state: ResourcesMutableState;
  level: number;
  totalSlots: number;
}

/**
 * What every op handler returns: the audit-event fields plus the new column
 * values the shared tail writes. The handler has already mutated
 * `ctx.state.advancements`; the tail serializes that same state.
 */
interface AdvancementOpOutcome {
  summary: string;
  eventType: "abilityScoreImprovement" | "featTaken" | "advancementRemoved";
  eventData: Record<string, unknown>;
  newScores: Record<string, number>;
  newHp: HitPoints;
  newInitBonus: number;
}

/**
 * Deep-clones the advancement-relevant column state for the audit event's
 * before/after payloads. Undo (revertAdvancementEvent) restores exactly these
 * four keys wholesale — the shape is a compatibility contract with stored events.
 */
function snapshotAdvancementState(
  scores: Record<string, number>,
  hp: HitPoints,
  initBonus: number,
  state: ResourcesMutableState,
) {
  return {
    abilityScores: { ...scores },
    hitPoints: { ...hp, deathSaves: { ...hp.deathSaves } },
    initiativeBonus: initBonus,
    // Full resources snapshot (incl. fightingStyle) so revert can't wipe it (#818).
    resources: snapshotResources(state),
  };
}

function assertSlotAvailable(state: ResourcesMutableState, totalSlots: number): void {
  if (state.advancements.length >= totalSlots) {
    throw new InvalidAdvancementOperationError(
      `No advancement slots available (${state.advancements.length}/${totalSlots} used)`,
    );
  }
}

/**
 * Validates a half-feat ability bump (shared by the catalog and custom takeFeat
 * paths) and returns the resulting abilityDeltas — empty when the feat has no
 * abilityOptions. The missing-choice message is the only wording difference
 * between the two paths, so the caller supplies it.
 */
function resolveHalfFeatBump(args: {
  featName: string;
  abilityOptions: string[];
  abilityIncrease: number;
  abilityChoice: string | undefined;
  scores: Record<string, number>;
  missingChoiceMessage: string;
}): Record<string, number> {
  const { featName, abilityOptions, abilityIncrease, abilityChoice, scores, missingChoiceMessage } = args;
  const abilityDeltas: Record<string, number> = {};
  if (abilityOptions.length === 0) return abilityDeltas;

  if (!abilityChoice) {
    throw new InvalidAdvancementOperationError(missingChoiceMessage);
  }
  if (!abilityOptions.includes(abilityChoice)) {
    throw new InvalidAdvancementOperationError(
      `takeFeat: "${abilityChoice}" is not a valid choice for "${featName}" (options: ${abilityOptions.join(", ")})`,
    );
  }
  const current = scores[abilityChoice] ?? 10;
  if (current + abilityIncrease > ABILITY_CAP) {
    throw new InvalidAdvancementOperationError(
      `takeFeat: ${abilityChoice} would exceed ${ABILITY_CAP} with +${abilityIncrease}`,
    );
  }
  abilityDeltas[abilityChoice] = abilityIncrease;
  return abilityDeltas;
}

/** Validates a takeAsi op's increases (count, sum, ability names, per-ability cap). */
function validateAsiIncreases(op: TakeAsiOperation, scores: Record<string, number>): void {
  if (!op.increases || op.increases.length === 0 || op.increases.length > 2) {
    throw new InvalidAdvancementOperationError(
      "takeAsi: provide 1 or 2 increases",
    );
  }
  const totalPoints = op.increases.reduce((s, inc) => s + inc.amount, 0);
  if (totalPoints !== 2) {
    throw new InvalidAdvancementOperationError(
      `takeAsi: increases must sum to exactly 2 (got ${totalPoints})`,
    );
  }
  for (const { ability, amount } of op.increases) {
    if (!ABILITY_NAMES.has(ability)) {
      throw new InvalidAdvancementOperationError(
        `takeAsi: unknown ability "${ability}"`,
      );
    }
    if (amount !== 1 && amount !== 2) {
      throw new InvalidAdvancementOperationError(
        `takeAsi: amount must be 1 or 2, got ${amount}`,
      );
    }
    const current = scores[ability] ?? 10;
    if (current + amount > ABILITY_CAP) {
      throw new InvalidAdvancementOperationError(
        `takeAsi: ${ability} would exceed ${ABILITY_CAP} (current ${current}, +${amount})`,
      );
    }
  }
}

function applyTakeAsi(ctx: AdvancementOpContext, op: TakeAsiOperation): AdvancementOpOutcome {
  const { scores, hp, hitDice, initBonus, state, level, totalSlots } = ctx;

  assertSlotAvailable(state, totalSlots);
  validateAsiIncreases(op, scores);

  const abilityDeltas: Record<string, number> = {};
  for (const { ability, amount } of op.increases) {
    abilityDeltas[ability] = (abilityDeltas[ability] ?? 0) + amount;
  }

  const { newScores, hpDelta, initDelta } = computeAdvancementEffect(scores, hitDice.total, abilityDeltas);

  const entry: AdvancementEntry = {
    id: randomUUID(),
    level,
    kind: "asi",
    abilityDeltas,
    hpDelta,
    initDelta,
  };
  state.advancements.push(entry);

  const incDesc = op.increases
    .map(({ ability, amount }) => `${ability} +${amount}`)
    .join(", ");
  return {
    summary: `Ability Score Improvement: ${incDesc}`,
    eventType: "abilityScoreImprovement",
    eventData: { entryId: entry.id, abilityDeltas, hpDelta, initDelta },
    newScores,
    newHp: { ...hp, max: hp.max + hpDelta, current: hp.current + hpDelta },
    newInitBonus: initBonus + initDelta,
  };
}

/** The catalog-vs-custom resolution result consumed by applyTakeFeat's shared tail. */
interface ResolvedFeat {
  featName: string;
  featDescription: string;
  featId?: string;
  improvements: FeatImprovement[];
  abilityDeltas: Record<string, number>;
}

async function resolveCatalogFeat(
  tx: Prisma.TransactionClient,
  op: TakeFeatOperation,
  scores: Record<string, number>,
): Promise<ResolvedFeat> {
  const catalogFeat = await tx.feat.findUnique({ where: { id: op.featId } });
  if (!catalogFeat) {
    throw new InvalidAdvancementOperationError(
      `Feat not found in catalog: ${op.featId}`,
    );
  }
  return {
    featName: catalogFeat.name,
    featDescription: catalogFeat.description,
    featId: catalogFeat.id,
    // Snapshot the catalog's improvements so removal/derivation never
    // depend on the catalog row being present or unchanged.
    improvements: (catalogFeat.improvements as unknown as FeatImprovement[]) ?? [],
    abilityDeltas: resolveHalfFeatBump({
      featName: catalogFeat.name,
      abilityOptions: catalogFeat.abilityOptions,
      abilityIncrease: catalogFeat.abilityIncrease,
      abilityChoice: op.abilityChoice,
      scores,
      missingChoiceMessage: `takeFeat: "${catalogFeat.name}" is a half-feat — provide abilityChoice from: ${catalogFeat.abilityOptions.join(", ")}`,
    }),
  };
}

function resolveCustomFeat(op: TakeFeatOperation, scores: Record<string, number>): ResolvedFeat {
  const c = op.custom!;
  if (!c.name?.trim()) {
    throw new InvalidAdvancementOperationError("takeFeat: custom feat name is required");
  }
  const featName = c.name.trim();
  return {
    featName,
    featDescription: c.description ?? "",
    // Custom feats may supply structured improvements directly.
    improvements: c.improvements ?? [],
    // Custom half-feat: optional ability bump, same rules as catalog half-feats.
    abilityDeltas: resolveHalfFeatBump({
      featName,
      abilityOptions: c.abilityOptions ?? [],
      abilityIncrease: c.abilityIncrease ?? 1,
      abilityChoice: op.abilityChoice,
      scores,
      missingChoiceMessage: `takeFeat: custom feat "${featName}" has abilityOptions — provide abilityChoice from: ${(c.abilityOptions ?? []).join(", ")}`,
    }),
  };
}

async function applyTakeFeat(ctx: AdvancementOpContext, op: TakeFeatOperation): Promise<AdvancementOpOutcome> {
  const { tx, scores, hp, hitDice, initBonus, state, level, totalSlots } = ctx;

  assertSlotAvailable(state, totalSlots);

  // Exactly one of featId or custom.
  if (Boolean(op.featId) === Boolean(op.custom)) {
    throw new InvalidAdvancementOperationError(
      "takeFeat: provide exactly one of featId or custom",
    );
  }

  const { featName, featDescription, featId: resolvedFeatId, improvements: featImprovements, abilityDeltas } =
    op.featId ? await resolveCatalogFeat(tx, op, scores) : resolveCustomFeat(op, scores);

  const { newScores, hpDelta, initDelta } = computeAdvancementEffect(scores, hitDice.total, abilityDeltas);

  const entry: AdvancementEntry = {
    id: randomUUID(),
    level,
    kind: "feat",
    abilityDeltas,
    hpDelta,
    initDelta,
    featId: resolvedFeatId,
    featName,
    featDescription,
    improvements: featImprovements,
  };
  state.advancements.push(entry);

  const abilityBumpDesc = Object.entries(abilityDeltas).length > 0
    ? ` (+${Object.values(abilityDeltas)[0]} ${Object.keys(abilityDeltas)[0]})`
    : "";
  return {
    summary: `Feat: ${featName}${abilityBumpDesc}`,
    eventType: "featTaken",
    eventData: {
      entryId: entry.id,
      featName,
      featId: resolvedFeatId ?? null,
      abilityDeltas,
      hpDelta,
      initDelta,
    },
    newScores,
    newHp: { ...hp, max: hp.max + hpDelta, current: hp.current + hpDelta },
    newInitBonus: initBonus + initDelta,
  };
}

function applyRemoveAdvancement(ctx: AdvancementOpContext, op: RemoveAdvancementOperation): AdvancementOpOutcome {
  const { scores, hp, initBonus, state } = ctx;

  const idx = state.advancements.findIndex((a) => a.id === op.entryId);
  if (idx === -1) {
    throw new InvalidAdvancementOperationError(
      `Advancement entry not found: ${op.entryId}`,
    );
  }

  const removed = state.advancements[idx];

  // Reverse the single entry's effects on scores, HP, and initiative.
  const reversed = reverseAdvancementEffects(scores, hp, initBonus, [removed]);

  state.advancements.splice(idx, 1);

  const label = removed.kind === "feat"
    ? `Feat: ${removed.featName ?? "Custom"}`
    : `ASI: ${Object.entries(removed.abilityDeltas).map(([a, d]) => `${a} +${d}`).join(", ")}`;
  return {
    summary: `Removed advancement: ${label}`,
    eventType: "advancementRemoved",
    eventData: { entryId: op.entryId, label },
    newScores: reversed.scores,
    newHp: reversed.hitPoints,
    newInitBonus: reversed.initiativeBonus,
  };
}

function dispatchAdvancementOp(
  ctx: AdvancementOpContext,
  op: AdvancementOperation,
): AdvancementOpOutcome | Promise<AdvancementOpOutcome> {
  switch (op.type) {
    case "takeAsi": return applyTakeAsi(ctx, op);
    case "takeFeat": return applyTakeFeat(ctx, op);
    case "removeAdvancement": return applyRemoveAdvancement(ctx, op);
    default: {
      const _exhaustive: never = op;
      throw new InvalidAdvancementOperationError(`Unknown op type: ${(_exhaustive as { type: string }).type}`);
    }
  }
}

// Columns/relations applyAdvancementOpInTx re-reads per op; the batch wrapper's
// scaffold row is an existence-only { id: true } check.
const ADVANCEMENT_SELECT = {
  resources: true,
  abilityScores: true,
  hitPoints: true,
  hitDice: true,
  initiativeBonus: true,
  experiencePoints: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    take: 1,
    select: { name: true },
  },
} satisfies Prisma.CharacterSelect;

/**
 * Applies one advancement op inside a caller-supplied transaction/batchId, so the
 * unified level-up endpoint (#885) can compose advancement with other domains
 * under one batchId. Reads fresh state via `tx` on every call — a batch of 2 ASIs
 * must see each other's results — then dispatches → writes back → logs its own
 * event (same phases as the wrapper's applyOp, now the single copy of the logic).
 */
export async function applyAdvancementOpInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: AdvancementOperation,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  const character = await tx.character.findUnique({
    where: { id: characterId },
    select: ADVANCEMENT_SELECT,
  });
  if (!character) {
    throw new InvalidAdvancementOperationError(`Character not found: ${characterId}`);
  }

  const level = levelForExperience(character.experiencePoints);
  proficiencyBonusForLevel(level); // validate level is reachable (side-effect-free)
  const className = character.classEntries[0]?.name ?? "";

  const ctx: AdvancementOpContext = {
    tx,
    scores: character.abilityScores as Record<string, number>,
    hp: normalizeHitPoints(character.hitPoints),
    hitDice: normalizeHitDice(character.hitDice),
    initBonus: character.initiativeBonus,
    state: normalizeResourcesMutable(character.resources),
    level,
    totalSlots: advancementSlotsForLevel(className, level),
  };

  const before = snapshotAdvancementState(ctx.scores, ctx.hp, ctx.initBonus, ctx.state);
  const outcome = await dispatchAdvancementOp(ctx, op);

  await tx.character.update({
    where: { id: characterId },
    data: {
      abilityScores: outcome.newScores as unknown as Prisma.InputJsonValue,
      hitPoints: outcome.newHp as unknown as Prisma.InputJsonValue,
      initiativeBonus: outcome.newInitBonus,
      resources: serializeResourcesState(ctx.state),
    },
  });

  const after = snapshotAdvancementState(outcome.newScores, outcome.newHp, outcome.newInitBonus, ctx.state);

  await logEvent(tx, {
    characterId,
    category: "advancement",
    type: outcome.eventType,
    summary: outcome.summary,
    before,
    after,
    data: outcome.eventData,
    batchId,
    sessionId,
  });
}

/**
 * Applies a batch of advancement operations atomically in one Prisma transaction.
 * Mirrors applyResourceOperations / applySpellcastingOperations exactly:
 *   - one batchId per request groups ops on the activity timeline
 *   - any throw rolls back the entire batch
 *   - CharacterEvent logged per op with before/after snapshot for undo symmetry
 *
 * The scaffold's per-op row is only the existence check: applyAdvancementOpInTx
 * re-reads its own state via ADVANCEMENT_SELECT so it composes under a caller tx.
 */
export async function applyAdvancementOperations(
  characterId: string,
  operations: AdvancementOperation[],
): Promise<void> {
  await runCharacterTransaction(characterId, operations, {
    select: { id: true },
    notFound: (id) => new InvalidAdvancementOperationError(`Character not found: ${id}`),
    applyOp: ({ tx, op, characterId: id, batchId, sessionId }) =>
      applyAdvancementOpInTx(tx, id, op, batchId, sessionId),
  });
}
